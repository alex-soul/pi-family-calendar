import type { DatabaseSync } from 'node:sqlite';
import { addDays } from '../dates.ts';
import type { CalendarEvent } from '../domain.ts';
import { normalizeEvent, type GoogleEvent } from './google-api.ts';
export interface Range {
	from: string;
	to: string;
}
export interface MirrorState {
	ranges: Range[];
	lastSuccess: string;
	lastAttempt: string;
	nextAttempt: number;
	failures: number;
	error: string;
	historyStart: string;
	backfillAt: number;
}
export function mergeRanges(ranges: Range[]): Range[] {
	const result: Range[] = [];
	for (const range of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
		const last = result.at(-1);
		if (last && range.from <= last.to) last.to = last.to > range.to ? last.to : range.to;
		else result.push({ ...range });
	}
	return result;
}
export function missingRanges(range: Range, covered: Range[]): Range[] {
	let from = range.from;
	const result: Range[] = [];
	for (const part of mergeRanges(covered)) {
		if (part.to <= from || part.from >= range.to) continue;
		if (part.from > from) result.push({ from, to: part.from });
		if (part.to > from) from = part.to;
	}
	if (from < range.to) result.push({ from, to: range.to });
	return result;
}
export function standardRange(today: string): Range {
	const year = Number(today.slice(0, 4)),
		month = Number(today.slice(5, 7)) - 1;
	const date = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
	return { from: date(year, month - 1), to: date(year + 1, month + 1) };
}
export class CalendarMirror {
	private db: DatabaseSync;
	constructor(db: DatabaseSync) {
		this.db = db;
		db.exec(`CREATE TABLE IF NOT EXISTS mirror_state (calendar TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS mirror_events (calendar TEXT NOT NULL, id TEXT NOT NULL, parent TEXT, value TEXT NOT NULL, start_day TEXT NOT NULL, end_day TEXT NOT NULL, PRIMARY KEY(calendar,id));
		CREATE INDEX IF NOT EXISTS mirror_dates ON mirror_events(calendar,start_day,end_day);
		CREATE INDEX IF NOT EXISTS mirror_parent ON mirror_events(calendar,parent);
		CREATE TABLE IF NOT EXISTS mirror_raw (calendar TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(calendar,id));
		CREATE TABLE IF NOT EXISTS mirror_metrics (day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0);`);
	}
	transaction<T>(run: () => T): T {
		this.db.exec('BEGIN IMMEDIATE');
		try {
			const result = run();
			this.db.exec('COMMIT');
			return result;
		} catch (cause) {
			this.db.exec('ROLLBACK');
			throw cause;
		}
	}
	state(id: string): MirrorState {
		const row = this.db.prepare('SELECT value FROM mirror_state WHERE calendar=?').get(id) as
			{ value: string } | undefined;
		return row
			? JSON.parse(row.value)
			: {
					ranges: [],
					lastSuccess: '',
					lastAttempt: '',
					nextAttempt: 0,
					failures: 0,
					error: '',
					historyStart: '',
					backfillAt: 0
				};
	}
	saveState(id: string, state: MirrorState) {
		this.db
			.prepare('INSERT OR REPLACE INTO mirror_state VALUES (?,?)')
			.run(id, JSON.stringify(state));
	}
	ids(): string[] {
		return (
			this.db.prepare('SELECT calendar FROM mirror_state').all() as { calendar: string }[]
		).map((r) => r.calendar);
	}
	raw(id: string, eventId: string): GoogleEvent | undefined {
		const row = this.db
			.prepare('SELECT value FROM mirror_raw WHERE calendar=? AND id=?')
			.get(id, eventId) as { value: string } | undefined;
		return row ? JSON.parse(row.value) : undefined;
	}
	applyRaw(id: string, items: GoogleEvent[], full = false) {
		if (full) this.db.prepare('DELETE FROM mirror_raw WHERE calendar=?').run(id);
		for (const item of items) {
			if (!item.id) throw new Error('Missing event identity');
			if (item.status === 'cancelled')
				this.db.prepare('DELETE FROM mirror_raw WHERE calendar=? AND id=?').run(id, item.id);
			else
				this.db
					.prepare('INSERT OR REPLACE INTO mirror_raw VALUES (?,?,?)')
					.run(id, item.id, JSON.stringify(item));
		}
	}
	historyStart(id: string): string {
		let first = '';
		for (const row of this.db
			.prepare('SELECT value FROM mirror_raw WHERE calendar=?')
			.iterate(id)) {
			const item = JSON.parse(row.value as string) as GoogleEvent;
			const date = (item.start?.date || item.start?.dateTime || '').slice(0, 10);
			if (date && (!first || date < first)) first = date;
		}
		return first && first < '1900-01-01' ? '1900-01-01' : first;
	}
	put(id: string, items: GoogleEvent[]) {
		for (const item of items) {
			const event = normalizeEvent(item, id);
			if (!event) {
				if (item.id) this.removeEvent(id, item.id);
				continue;
			}
			const start =
				event.kind === 'all-day'
					? event.startDate
					: new Date(event.start).toISOString().slice(0, 10);
			const end =
				event.kind === 'all-day' ? event.endDate : new Date(event.end).toISOString().slice(0, 10);
			this.db
				.prepare('INSERT OR REPLACE INTO mirror_events VALUES (?,?,?,?,?,?)')
				.run(id, item.id!, item.recurringEventId || null, JSON.stringify(event), start, end);
		}
	}
	removeEvent(id: string, eventId: string) {
		this.db
			.prepare('DELETE FROM mirror_events WHERE calendar=? AND (id=? OR parent=?)')
			.run(id, eventId, eventId);
	}
	clearEvents(id: string) {
		this.db.prepare('DELETE FROM mirror_events WHERE calendar=?').run(id);
	}
	replaceRange(id: string, range: Range, items: GoogleEvent[]) {
		this.db
			.prepare(
				`DELETE FROM mirror_events WHERE calendar=? AND (
                (json_extract(value,'$.kind')='all-day' AND start_day<? AND end_day>?) OR
                (json_extract(value,'$.kind')='timed' AND julianday(json_extract(value,'$.start'))<julianday(?) AND julianday(json_extract(value,'$.end'))>julianday(?))
            )`
			)
			.run(
				id,
				addDays(range.to, 1),
				addDays(range.from, -1),
				addDays(range.to, 1),
				addDays(range.from, -1)
			);
		this.put(id, items);
	}
	read(id: string, range: Range): CalendarEvent[] {
		return (
			this.db
				.prepare(
					'SELECT value FROM mirror_events WHERE calendar=? AND start_day<? AND end_day>=? ORDER BY start_day,id'
				)
				.all(id, addDays(range.to, 1), addDays(range.from, -1)) as { value: string }[]
		).map((r) => JSON.parse(r.value));
	}
	remove(id: string) {
		for (const table of ['mirror_events', 'mirror_raw', 'mirror_state'])
			this.db.prepare(`DELETE FROM ${table} WHERE calendar=?`).run(id);
	}
	request() {
		const day = new Date().toISOString().slice(0, 10);
		this.db
			.prepare(
				'INSERT INTO mirror_metrics VALUES (?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1'
			)
			.run(day);
		this.db.prepare('DELETE FROM mirror_metrics WHERE day<?').run(addDays(day, -30));
	}
	stats() {
		const count = (table: string) =>
			(this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
		const day = new Date().toISOString().slice(0, 10);
		return {
			eventCount: count('mirror_events'),
			sourceCount: count('mirror_raw'),
			requestsToday:
				(
					this.db.prepare('SELECT requests FROM mirror_metrics WHERE day=?').get(day) as
						{ requests: number } | undefined
				)?.requests || 0
		};
	}
}

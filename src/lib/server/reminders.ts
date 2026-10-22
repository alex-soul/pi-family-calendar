import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dateKey, isDateKey } from '../dates.ts';
import { canCompleteReminder } from '../reminder-completion.ts';
import { occursOn } from '../recurrence.ts';
import { compareReminderTime } from '../reminder-time.ts';
import { categoryColors, categoryIcons, generalCategory } from '../categories.ts';
import type { NoteCategory } from '../domain.ts';
import { reminderLists, type Reminder, type ReminderInput } from '../domain.ts';

export class ReminderError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export function validateReminder(value: unknown): ReminderInput {
	if (!value || typeof value !== 'object') throw new ReminderError('A reminder is required.', 400);
	const input = value as Record<string, unknown>;
	const title = typeof input.title === 'string' ? input.title.trim() : '';
	if (!title || title.length > 160)
		throw new ReminderError('Use a title between 1 and 160 characters.', 400);
	if (
		typeof input.list !== 'string' ||
		!reminderLists.includes(input.list as (typeof reminderLists)[number])
	)
		throw new ReminderError('Choose a reminder list.', 400);
	if (input.dueDate !== null && !isDateKey(input.dueDate))
		throw new ReminderError('Use a valid due date or leave it empty.', 400);
	if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 2000))
		throw new ReminderError('Use notes of up to 2000 characters.', 400);
	if (input.kind !== undefined && input.kind !== 'todo' && input.kind !== 'note')
		throw new ReminderError('Choose To do or Note.', 400);
	let repeat: ReminderInput['repeat'] = undefined;
	if (input.repeat !== undefined) {
		if (input.repeat === null) repeat = null;
		else {
			const rule = input.repeat as Record<string, unknown>;
			if (
				typeof rule !== 'object' ||
				!['daily', 'weekdays', 'weekly', 'monthly'].includes(String(rule.frequency)) ||
				!Number.isInteger(rule.interval) ||
				Number(rule.interval) < 1 ||
				Number(rule.interval) > 52 ||
				(rule.frequency === 'weekdays' && rule.interval !== 1)
			)
				throw new ReminderError('Choose a repeat frequency and an interval from 1 to 52.', 400);
			if (!isDateKey(input.dueDate))
				throw new ReminderError('A repeating reminder needs a start date.', 400);
			if (
				rule.until !== null &&
				(!isDateKey(rule.until) || String(rule.until) < String(input.dueDate))
			)
				throw new ReminderError('The end date must be on or after the start date.', 400);
			repeat = {
				frequency: rule.frequency as NonNullable<ReminderInput['repeat']>['frequency'],
				interval: Number(rule.interval),
				until: rule.until as string | null
			};
		}
	}
	const time = (name: string) => {
		const value = input[name];
		if (value === undefined || value === null || value === '') return null;
		if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
			throw new ReminderError('Use a valid time in HH:MM format.', 400);
		return value;
	};
	const dueTime = time('dueTime'),
		showFrom = time('showFrom'),
		showUntil = time('showUntil');
	const kind = input.kind || 'todo';
	if (
		input.categoryId !== undefined &&
		(typeof input.categoryId !== 'string' || input.categoryId.length > 100)
	)
		throw new ReminderError('Choose a Note category.', 400);
	if (
		kind === 'note' &&
		input.dueDate &&
		((showFrom === null) !== (showUntil === null) ||
			(showFrom && showUntil && showUntil <= showFrom))
	)
		throw new ReminderError('Choose both times, with the end later on the same day.', 400);
	return {
		categoryId: kind === 'note' ? String(input.categoryId || 'general') : 'general',
		dueTime: input.dueDate && kind === 'todo' ? dueTime : null,
		showFrom: input.dueDate && kind === 'note' ? showFrom : null,
		showUntil: input.dueDate && kind === 'note' ? showUntil : null,
		...(repeat !== undefined ? { repeat } : {}),
		...(input.kind !== undefined ? { kind: input.kind as 'todo' | 'note' } : {}),
		title,
		list: input.list,
		dueDate: input.dueDate as string | null,
		...(input.notes !== undefined ? { notes: (input.notes as string).trim() } : {})
	};
}

export interface ReminderRepository {
	list(): Reminder[];
	create(input: ReminderInput): Reminder;
	update(id: string, version: number, value: ReminderInput): Reminder;
	complete(id: string, version: number, completed: boolean, occurrenceDate?: string): Reminder;
	remove(id: string, version: number): void;
}

export class SqliteReminders implements ReminderRepository {
	private db: DatabaseSync;
	private today: () => string;
	constructor(
		path: string,
		today: () => string = () => dateKey(new Date(), 'UTC'),
		options: { resetLegacy?: boolean } = {}
	) {
		this.today = today;
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(
			'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'
		);
		const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
		if (version > 6 || (version > 0 && version < 6 && !options.resetLegacy)) {
			this.db.close();
			throw new Error(
				version > 6
					? 'Database is newer than this application.'
					: 'Legacy reminders require the explicit one-time reminder reset.'
			);
		}
		this.db.exec('BEGIN IMMEDIATE');
		try {
			if (version > 0 && version < 6) {
				this.db.exec('DROP TABLE IF EXISTS reminder_occurrences; DROP TABLE IF EXISTS reminders;');
				// Preserve QR settings, but discard grants/receipts referring to removed reminders.
				for (const table of ['grants', 'receipts'])
					if (
						this.db
							.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
							.get(table)
					)
						this.db.exec(`DELETE FROM ${table}`);
			}
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS note_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL, version INTEGER NOT NULL);
				CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
				CREATE INDEX IF NOT EXISTS reminders_date ON reminders(json_extract(data,'$.dueDate'));
				CREATE INDEX IF NOT EXISTS reminders_repeat ON reminders(json_type(data,'$.repeat'));
				CREATE INDEX IF NOT EXISTS reminders_pending ON reminders(json_extract(data,'$.kind'),json_extract(data,'$.completedAt'),json_extract(data,'$.dueDate'));
				CREATE INDEX IF NOT EXISTS reminders_created ON reminders(COALESCE(json_extract(data,'$.createdOn'),'' ) DESC,id);
				CREATE TABLE IF NOT EXISTS generation_days (date TEXT PRIMARY KEY, templates TEXT NOT NULL);
				CREATE TABLE IF NOT EXISTS generation_attempts (date TEXT NOT NULL, slot TEXT NOT NULL, PRIMARY KEY(date,slot));
				CREATE TABLE IF NOT EXISTS generation_receipts (templateId TEXT NOT NULL, date TEXT NOT NULL, itemId TEXT NOT NULL, PRIMARY KEY(templateId,date));
				PRAGMA user_version = 6;
			`);
			this.db.exec('COMMIT');
		} catch (cause) {
			this.db.exec('ROLLBACK');
			this.db.close();
			throw cause;
		}
	}
	private decode(row: Record<string, unknown>): Reminder {
		const item = {
			...JSON.parse(String(row.data)),
			id: String(row.id),
			version: Number(row.version)
		};
		delete item.category;
		return {
			...item,
			categoryId: item.categoryId || 'general',
			...(item.kind === 'note'
				? {
						category:
							this.categories().find((c) => c.id === (item.categoryId || 'general')) ||
							generalCategory
					}
				: {})
		};
	}
	categories(): NoteCategory[] {
		return [
			generalCategory,
			...(this.db
				.prepare('SELECT * FROM note_categories ORDER BY name COLLATE NOCASE,id')
				.all() as unknown as NoteCategory[])
		];
	}
	private categoryExists(input: ReminderInput) {
		if (input.kind === 'note' && !this.categories().some((c) => c.id === input.categoryId))
			throw new ReminderError(
				'This category was removed. Reload and choose General or another category.',
				409
			);
	}
	saveCategory(value: unknown, id?: string, version?: number): NoteCategory {
		return this.transaction(() => {
			if (id === 'general') throw new ReminderError('General cannot be changed.', 400);
			const v = value as Record<string, unknown>;
			if (
				!v ||
				typeof v.name !== 'string' ||
				!v.name.trim() ||
				v.name.trim().length > 40 ||
				v.name.trim().toLowerCase() === 'general' ||
				!categoryColors.includes(String(v.color)) ||
				!categoryIcons.includes(String(v.icon))
			)
				throw new ReminderError('Use a category name, palette colour and available icon.', 400);
			if (id && this.categories().find((c) => c.id === id)?.version !== version)
				throw new ReminderError('Category changed or was removed. Reload and try again.', 409);
			if (
				this.categories().some(
					(c) => c.id !== id && c.name.toLowerCase() === String(v.name).trim().toLowerCase()
				)
			)
				throw new ReminderError('A category with this name already exists.', 409);
			if (!id && this.categories().length >= 33)
				throw new ReminderError('Use up to 32 custom categories.', 400);
			const category = {
				id: id || randomUUID(),
				name: v.name.trim(),
				color: String(v.color),
				icon: String(v.icon),
				version: id ? Number(version) + 1 : 1
			};
			this.db
				.prepare(
					'INSERT INTO note_categories VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,icon=excluded.icon,version=excluded.version'
				)
				.run(category.id, category.name, category.color, category.icon, category.version);
			return category;
		});
	}
	removeCategory(id: string, version: number) {
		this.transaction(() => {
			if (id === 'general') throw new ReminderError('General cannot be deleted.', 400);
			if (this.categories().find((c) => c.id === id)?.version !== version)
				throw new ReminderError('Category changed or was removed. Reload and try again.', 409);
			this.db
				.prepare(
					"UPDATE reminders SET data=json_remove(json_set(data,'$.categoryId','general'),'$.category'),version=version+1 WHERE json_extract(data,'$.categoryId')=?"
				)
				.run(id);
			this.db.prepare('DELETE FROM note_categories WHERE id=?').run(id);
		});
	}
	query(from: string, to: string): Reminder[] {
		if (
			!isDateKey(from) ||
			!isDateKey(to) ||
			to <= from ||
			Date.parse(to) - Date.parse(from) > 62 * 86400000
		)
			throw new ReminderError('Choose a range of up to 62 days.', 400);
		return this.db
			.prepare(
				"SELECT * FROM reminders WHERE json_type(data,'$.repeat')='object' OR json_extract(data,'$.dueDate') IS NULL OR json_extract(data,'$.dueDate')=? OR (json_extract(data,'$.dueDate')>=? AND json_extract(data,'$.dueDate')<?) OR (json_extract(data,'$.kind')='todo' AND json_extract(data,'$.completedAt') IS NULL AND json_extract(data,'$.dueDate')<=?)"
			)
			.all(this.today(), from, to, this.today())
			.map((r) => this.decode(r))
			.sort(compareReminderTime);
	}
	page(offset = 0): Reminder[] {
		return this.db
			.prepare(
				"SELECT * FROM reminders ORDER BY COALESCE(json_extract(data,'$.createdOn'),'' ) DESC,id LIMIT 200 OFFSET ?"
			)
			.all(offset)
			.map((r) => this.decode(r));
	}
	list(): Reminder[] {
		return this.db
			.prepare('SELECT * FROM reminders')
			.all()
			.map((row) => this.decode(row))
			.sort(compareReminderTime);
	}
	get(id: string): Reminder {
		const row = this.db.prepare('SELECT * FROM reminders WHERE id=?').get(id);
		if (!row) throw new ReminderError('This reminder no longer exists.', 404);
		return this.decode(row);
	}
	get database() {
		return this.db;
	}
	private transaction<T>(work: () => T): T {
		this.db.exec('SAVEPOINT reminder_mutation');
		try {
			const result = work();
			this.db.exec('RELEASE reminder_mutation');
			return result;
		} catch (cause) {
			this.db.exec('ROLLBACK TO reminder_mutation; RELEASE reminder_mutation');
			throw cause;
		}
	}
	private current(id: string, version: number): Reminder {
		const item = this.get(id);
		if (item.version !== version)
			throw new ReminderError(
				'This reminder changed on another screen. Refresh and try again.',
				409
			);
		return item;
	}
	private insert(data: Omit<Reminder, 'id' | 'version'>): Reminder {
		const id = randomUUID();
		this.db.prepare('INSERT INTO reminders VALUES (?,1,?)').run(id, JSON.stringify(data));
		return this.get(id);
	}
	create(value: ReminderInput): Reminder {
		const input = validateReminder(value);
		this.categoryExists(input);
		return this.insert({
			...input,
			kind: input.kind || 'todo',
			notes: input.notes || '',
			repeat: input.repeat || null,
			completedAt: null,
			createdOn: this.today()
		});
	}
	update(id: string, version: number, value: ReminderInput): Reminder {
		return this.transaction(() => {
			const old = this.current(id, version);
			const input = validateReminder({ ...old, ...value });
			this.categoryExists(input);
			if (!!old.repeat !== !!input.repeat)
				throw new ReminderError(
					'Items and templates are separate. Create a new item or template instead.',
					400
				);
			const updated = {
				...old,
				...input,
				completedAt: input.kind === 'note' || input.repeat ? null : old.completedAt
			};
			this.db
				.prepare('UPDATE reminders SET data=?, version=version+1 WHERE id=?')
				.run(JSON.stringify(updated), id);
			return this.get(id);
		});
	}
	complete(id: string, version: number, completed: boolean, occurrenceDate?: string): Reminder {
		return this.transaction(() => {
			const item = this.current(id, version);
			if (item.kind === 'note') throw new ReminderError('Notes cannot be completed.', 400);
			if (item.repeat || occurrenceDate !== undefined)
				throw new ReminderError('Complete a saved item, not a repeating template or preview.', 400);
			if (completed && !canCompleteReminder(item, this.today()))
				throw new ReminderError('Future to-dos cannot be completed.', 400);
			this.db
				.prepare('UPDATE reminders SET data=?, version=version+1 WHERE id=?')
				.run(
					JSON.stringify({ ...item, completedAt: completed ? new Date().toISOString() : null }),
					id
				);
			return this.get(id);
		});
	}
	remove(id: string, version: number): void {
		this.transaction(() => {
			this.current(id, version);
			this.db.prepare('DELETE FROM reminders WHERE id=?').run(id);
		});
	}
	/** Called only by a scheduled slot. Receipts outlive deleted/moved items and templates. */
	generate(
		date: string,
		slot: '00:00' | '01:00'
	): { created: number; failed: number; skipped: boolean } {
		if (!isDateKey(date) || date !== this.today() || !['00:00', '01:00'].includes(slot))
			throw new ReminderError('Generation is limited to the current scheduled day.', 400);
		const claimed = this.transaction(() => {
			if (
				!this.db.prepare('INSERT OR IGNORE INTO generation_attempts VALUES (?,?)').run(date, slot)
					.changes
			)
				return false;
			const templates = this.list()
				.filter((r) => r.repeat && r.createdOn! < date && occursOn(r, date))
				.map((r) => r.id);
			this.db
				.prepare('INSERT OR IGNORE INTO generation_days VALUES (?,?)')
				.run(date, JSON.stringify(templates));
			return true;
		});
		if (!claimed) return { created: 0, failed: 0, skipped: true };
		const ids: string[] = JSON.parse(
			String(
				this.db.prepare('SELECT templates FROM generation_days WHERE date=?').get(date)!.templates
			)
		);
		let created = 0,
			failed = 0;
		for (const id of ids) {
			try {
				created += this.transaction(() => {
					if (
						this.db
							.prepare('SELECT 1 FROM generation_receipts WHERE templateId=? AND date=?')
							.get(id, date)
					)
						return 0;
					const row = this.db.prepare('SELECT * FROM reminders WHERE id=?').get(id);
					if (!row) return 0;
					const template = this.decode(row);
					if (!template.repeat || !occursOn(template, date)) return 0;
					const input = validateReminder({ ...template, repeat: null, dueDate: date });
					const item = this.insert({
						...input,
						kind: template.kind,
						completedAt: null,
						repeat: null,
						createdOn: date,
						sourceTemplateId: id,
						sourceDate: date
					});
					this.db.prepare('INSERT INTO generation_receipts VALUES (?,?,?)').run(id, date, item.id);
					return 1;
				});
			} catch {
				failed++;
			}
		}
		return { created, failed, skipped: false };
	}
	close(): void {
		this.db.close();
	}
}

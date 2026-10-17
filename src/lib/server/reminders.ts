import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dateKey, isDateKey } from '../dates.ts';
import { canCompleteReminder } from '../reminder-completion.ts';
import { occursOn } from '../recurrence.ts';
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
	return {
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
	constructor(path: string, today: () => string = () => dateKey(new Date(), 'UTC')) {
		this.today = today;
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(
			'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'
		);
		const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
		if (version.user_version > 4) {
			this.db.close();
			throw new Error('Database is newer than this application.');
		}
		this.db.exec(`CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, list TEXT NOT NULL, dueDate TEXT,
      completedAt TEXT, version INTEGER NOT NULL DEFAULT 1
    );`);
		if (version.user_version < 2) {
			this.db.exec(
				"BEGIN; ALTER TABLE reminders ADD COLUMN notes TEXT NOT NULL DEFAULT ''; PRAGMA user_version = 2; COMMIT;"
			);
		}
		if (version.user_version < 3) {
			this.db.exec(
				"BEGIN; ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo' CHECK(kind IN ('todo', 'note')); PRAGMA user_version = 3; COMMIT;"
			);
		}
		if (version.user_version < 4) {
			this.db.exec(`BEGIN;
				ALTER TABLE reminders ADD COLUMN repeat TEXT;
				CREATE TABLE reminder_occurrences (reminderId TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE, date TEXT NOT NULL, completedAt TEXT NOT NULL, PRIMARY KEY(reminderId, date));
				UPDATE reminders SET list = 'General';
				PRAGMA user_version = 4; COMMIT;`);
		}
	}
	private decode(row: Record<string, unknown>): Reminder {
		const completed = this.db
			.prepare(
				'SELECT date, completedAt FROM reminder_occurrences WHERE reminderId = ? ORDER BY date'
			)
			.all(String(row.id)) as { date: string; completedAt: string }[];
		return {
			...row,
			repeat: row.repeat ? JSON.parse(String(row.repeat)) : null,
			completedDates: Object.fromEntries(completed.map((r) => [r.date, r.completedAt]))
		} as unknown as Reminder;
	}
	list(): Reminder[] {
		return this.db
			.prepare(
				'SELECT * FROM reminders ORDER BY completedAt IS NOT NULL, dueDate IS NULL, dueDate, title, id'
			)
			.all()
			.map((row) => this.decode(row));
	}
	private get(id: string): Reminder {
		const row = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
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
	private checkMutation(changes: number | bigint, id: string): Reminder {
		if (!changes) {
			this.get(id);
			throw new ReminderError(
				'This reminder changed on another screen. Refresh and try again.',
				409
			);
		}
		return this.get(id);
	}
	create(value: ReminderInput): Reminder {
		const input = validateReminder(value);
		const id = randomUUID();
		this.db
			.prepare(
				'INSERT INTO reminders (id, title, list, dueDate, notes, kind, repeat) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				id,
				input.title,
				input.list,
				input.dueDate,
				input.notes || '',
				input.kind || 'todo',
				input.repeat ? JSON.stringify(input.repeat) : null
			);
		return this.get(id);
	}
	update(id: string, version: number, value: ReminderInput): Reminder {
		return this.transaction(() => {
			const old = this.get(id);
			const input = validateReminder({
				...value,
				repeat: value.repeat === undefined ? old.repeat : value.repeat
			});
			const scheduleChanged =
				input.dueDate !== old.dueDate ||
				JSON.stringify(input.repeat) !== JSON.stringify(old.repeat);
			const clearCompletion =
				(!!(old.repeat || input.repeat) && scheduleChanged) || input.kind === 'note';
			const result = this.db
				.prepare(
					`UPDATE reminders SET title = ?, list = ?, dueDate = ?, notes = COALESCE(?, notes), kind = COALESCE(?, kind), repeat = ?, completedAt = CASE WHEN ? THEN NULL ELSE completedAt END, version = version + 1 WHERE id = ? AND version = ?`
				)
				.run(
					input.title,
					input.list,
					input.dueDate,
					input.notes ?? null,
					input.kind ?? null,
					input.repeat ? JSON.stringify(input.repeat) : null,
					clearCompletion ? 1 : 0,
					id,
					version
				);
			this.checkMutation(result.changes, id);
			if (clearCompletion)
				this.db.prepare('DELETE FROM reminder_occurrences WHERE reminderId = ?').run(id);
			return this.get(id);
		});
	}
	complete(id: string, version: number, completed: boolean, occurrenceDate?: string): Reminder {
		return this.transaction(() => {
			const item = this.get(id);
			if (item.kind === 'note')
				throw new ReminderError('Notes cannot be completed. Edit or delete the note instead.', 400);
			if (item.repeat) {
				if (!isDateKey(occurrenceDate) || !occursOn(item, occurrenceDate))
					throw new ReminderError('Choose a scheduled occurrence to complete.', 400);
			}
			if (completed && !canCompleteReminder({ ...item, occurrenceDate }, this.today()))
				throw new ReminderError('Dated to-dos can only be completed on their scheduled day.', 400);
			if (item.repeat) {
				const result = this.db
					.prepare('UPDATE reminders SET version = version + 1 WHERE id = ? AND version = ?')
					.run(id, version);
				this.checkMutation(result.changes, id);
				if (completed)
					this.db
						.prepare(
							'INSERT INTO reminder_occurrences (reminderId, date, completedAt) VALUES (?, ?, ?) ON CONFLICT(reminderId, date) DO UPDATE SET completedAt = excluded.completedAt'
						)
						.run(id, occurrenceDate!, new Date().toISOString());
				else
					this.db
						.prepare('DELETE FROM reminder_occurrences WHERE reminderId = ? AND date = ?')
						.run(id, occurrenceDate!);
			} else {
				if (occurrenceDate !== undefined)
					throw new ReminderError('This reminder does not repeat. Refresh and try again.', 409);
				const result = this.db
					.prepare(
						'UPDATE reminders SET completedAt = ?, version = version + 1 WHERE id = ? AND version = ?'
					)
					.run(completed ? new Date().toISOString() : null, id, version);
				this.checkMutation(result.changes, id);
			}
			return this.get(id);
		});
	}
	remove(id: string, version: number): void {
		const result = this.db
			.prepare('DELETE FROM reminders WHERE id = ? AND version = ?')
			.run(id, version);
		if (!result.changes) this.checkMutation(0, id);
	}
	close(): void {
		this.db.close();
	}
}

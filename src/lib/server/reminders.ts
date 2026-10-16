import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDateKey } from '../dates.ts';
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
	return { title, list: input.list, dueDate: input.dueDate as string | null };
}

export interface ReminderRepository {
	list(): Reminder[];
	create(input: ReminderInput): Reminder;
	update(id: string, version: number, input: ReminderInput): Reminder;
	complete(id: string, version: number, completed: boolean): Reminder;
	remove(id: string, version: number): void;
}

export class SqliteReminders implements ReminderRepository {
	private db: DatabaseSync;
	constructor(path: string) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(
			'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'
		);
		const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
		if (version.user_version > 1) {
			this.db.close();
			throw new Error('Database is newer than this application.');
		}
		this.db.exec(`CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, list TEXT NOT NULL, dueDate TEXT,
      completedAt TEXT, version INTEGER NOT NULL DEFAULT 1
    ); PRAGMA user_version = 1;`);
	}
	list(): Reminder[] {
		return this.db
			.prepare(
				'SELECT * FROM reminders ORDER BY completedAt IS NOT NULL, dueDate IS NULL, dueDate, title, id'
			)
			.all() as unknown as Reminder[];
	}
	private get(id: string): Reminder {
		const reminder = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as unknown as
			Reminder | undefined;
		if (!reminder) throw new ReminderError('This reminder no longer exists.', 404);
		return reminder;
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
			.prepare('INSERT INTO reminders (id, title, list, dueDate) VALUES (?, ?, ?, ?)')
			.run(id, input.title, input.list, input.dueDate);
		return this.get(id);
	}
	update(id: string, version: number, value: ReminderInput): Reminder {
		const input = validateReminder(value);
		const result = this.db
			.prepare(
				'UPDATE reminders SET title = ?, list = ?, dueDate = ?, version = version + 1 WHERE id = ? AND version = ?'
			)
			.run(input.title, input.list, input.dueDate, id, version);
		return this.checkMutation(result.changes, id);
	}
	complete(id: string, version: number, completed: boolean): Reminder {
		const result = this.db
			.prepare(
				'UPDATE reminders SET completedAt = ?, version = version + 1 WHERE id = ? AND version = ?'
			)
			.run(completed ? new Date().toISOString() : null, id, version);
		return this.checkMutation(result.changes, id);
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

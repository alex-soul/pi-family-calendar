import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dateKey } from '../src/lib/dates.ts';
import { canCompleteReminder } from '../src/lib/reminder-completion.ts';
import { occurrence } from '../src/lib/recurrence.ts';
import { DatabaseSync } from 'node:sqlite';
import { SqliteReminders, ReminderError, validateReminder } from '../src/lib/server/reminders.ts';

test('reminders survive reopening, support completion/undo and reject stale edits', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-test-'));
	const path = join(directory, 'test.sqlite');
	let store = new SqliteReminders(path, () => '2026-10-16');
	try {
		const added = store.create({
			title: '  Pack a bag  ',
			list: 'General',
			dueDate: '2026-10-16'
		});
		assert.equal(added.title, 'Pack a bag');
		store.close();
		store = new SqliteReminders(path, () => '2026-10-16');
		assert.equal(store.list()[0].id, added.id);
		const completed = store.complete(added.id, added.version, true);
		assert.ok(completed.completedAt);
		assert.throws(
			() =>
				store.update(added.id, added.version, {
					title: 'Stale overwrite',
					list: 'General',
					dueDate: null
				}),
			(e) => e instanceof ReminderError && e.status === 409
		);
		assert.throws(
			() => store.remove(added.id, added.version),
			(e) => e instanceof ReminderError && e.status === 409
		);
		const undone = store.complete(added.id, completed.version, false);
		assert.equal(undone.completedAt, null);
		const edited = store.update(added.id, undone.version, {
			title: 'New title',
			list: 'General',
			dueDate: null
		});
		assert.equal(edited.list, 'General');
		store.remove(added.id, edited.version);
		assert.deepEqual(store.list(), []);
		assert.throws(
			() => store.complete(added.id, edited.version, true),
			(e) => e instanceof ReminderError && e.status === 404
		);
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
test('validation rejects blank titles, impossible dates and unknown list names', () => {
	for (const input of [
		null,
		{},
		{ title: '', list: 'General', dueDate: null },
		{ title: 'Task', list: 'General', dueDate: '2026-02-30' },
		{ title: 'Task', list: 'Unknown', dueDate: null },
		{ title: 'Task', list: 'General', dueDate: null, kind: 'invalid' },
		{ title: 'Task', list: 'General', dueDate: null, notes: 42 },
		{ title: 'Task', list: 'General', dueDate: null, notes: 'x'.repeat(2001) }
	]) {
		assert.throws(() => validateReminder(input), ReminderError);
	}
});

test('v1 migration preserves reminders and notes survive editing, completion and reopening', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-migration-'));
	const path = join(directory, 'test.sqlite');
	const old = new DatabaseSync(path);
	old.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY, title TEXT NOT NULL, list TEXT NOT NULL, dueDate TEXT, completedAt TEXT, version INTEGER NOT NULL DEFAULT 1);
		INSERT INTO reminders VALUES ('legacy', 'Existing item', 'Household', '2026-10-16', NULL, 4);
		PRAGMA user_version = 1;`);
	old.close();
	let store = new SqliteReminders(path, () => '2026-10-16');
	try {
		const original = store.list()[0];
		assert.equal(original.version, 4);
		assert.equal(original.title, 'Existing item');
		assert.equal(original.notes, '');
		const updated = store.update(original.id, original.version, {
			...original,
			notes: 'Pack the blue bag\nCheck the side pocket'
		});
		const completed = store.complete(updated.id, updated.version, true);
		assert.equal(completed.notes, updated.notes);
		const edited = store.update(completed.id, completed.version, {
			title: 'New title',
			list: 'General',
			dueDate: null
		});
		assert.equal(edited.notes, updated.notes, 'older clients must not erase notes');
		store.close();
		store = new SqliteReminders(path, () => '2026-10-16');
		assert.deepEqual(store.list()[0], edited);
		assert.equal(store.update(edited.id, edited.version, { ...edited, notes: '' }).notes, '');
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('v2 migration preserves completed todos and details, defaults kind, and records schema v5', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-v2-'));
	const path = join(directory, 'test.sqlite');
	const old = new DatabaseSync(path);
	old.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY, title TEXT NOT NULL, list TEXT NOT NULL, dueDate TEXT, completedAt TEXT, version INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '');
        INSERT INTO reminders VALUES ('legacy', 'Keep me', 'Household', NULL, '2026-10-15T10:00:00Z', 7, 'Existing details'); PRAGMA user_version = 2;`);
	old.close();
	const store = new SqliteReminders(path, () => '2026-10-16');
	try {
		assert.deepEqual(
			{ ...store.list()[0] },
			{
				id: 'legacy',
				title: 'Keep me',
				list: 'General',
				dueDate: null,
				completedAt: '2026-10-15T10:00:00Z',
				version: 7,
				notes: 'Existing details',
				kind: 'todo',
				repeat: null,
				completedDates: {},
				completionWindows: []
			}
		);
		const reader = new DatabaseSync(path);
		assert.equal(reader.prepare('PRAGMA user_version').get()!.user_version, 5);
		reader.close();
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
test('notes persist, cannot complete, preserve kind on legacy edits and convert safely', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-note-'));
	const path = join(directory, 'test.sqlite');
	let store = new SqliteReminders(path, () => '2026-10-16');
	try {
		let note = store.create({
			kind: 'note',
			title: 'Library closes early',
			notes: 'At four',
			list: 'General',
			dueDate: '2026-10-16'
		});
		assert.equal(note.kind, 'note');
		for (const completed of [true, false])
			assert.throws(
				() => store.complete(note.id, note.version, completed),
				(e) => e instanceof ReminderError && e.status === 400
			);
		assert.deepEqual(store.list()[0], note);
		note = store.update(note.id, note.version, {
			title: 'Library closes at four',
			list: 'General',
			dueDate: null
		});
		assert.equal(note.kind, 'note');
		assert.equal(note.notes, 'At four');
		store.close();
		store = new SqliteReminders(path, () => '2026-10-16');
		assert.deepEqual(store.list()[0], note);
		const todo = store.update(note.id, note.version, { ...note, kind: 'todo' });
		const done = store.complete(todo.id, todo.version, true);
		const converted = store.update(done.id, done.version, { ...done, kind: 'note' });
		assert.equal(converted.completedAt, null);
		assert.throws(
			() => store.update(converted.id, done.version, { ...done, kind: 'todo' }),
			(e) => e instanceof ReminderError && e.status === 409
		);
		store.remove(converted.id, converted.version);
		assert.equal(store.list().length, 0);
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('completion allows overdue, actual local day and Anytime, with safe recurring and undo behaviour', () => {
	let now = new Date('2026-10-16T23:30:00Z'); // Already 17 October in London.
	const today = () => dateKey(now, 'Europe/London');
	const store = new SqliteReminders(':memory:', today);
	try {
		assert.equal(today(), '2026-10-17');
		for (const dueDate of ['2026-10-16', '2026-10-17', '2026-10-18', null]) {
			let item = store.create({ title: 'Fixture task', list: 'General', dueDate });
			const eligible = dueDate === null || dueDate <= today();
			assert.equal(canCompleteReminder(item, today()), eligible);
			if (eligible) {
				item = store.complete(item.id, item.version, true);
				assert.ok(item.completedAt);
			} else {
				assert.throws(() => store.complete(item.id, item.version, true), /Future or cleared/);
				assert.deepEqual(
					store.list().find((r) => r.id === item.id),
					item,
					'Rejected completion changes no state or version'
				);
			}
		}
		let recurring = store.create({
			title: 'Daily fixture',
			list: 'General',
			dueDate: '2026-10-16',
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		assert.equal(canCompleteReminder(recurring, today()), false);
		for (const date of ['2026-10-18']) {
			assert.equal(canCompleteReminder(occurrence(recurring, date), today()), false);
			assert.throws(
				() => store.complete(recurring.id, recurring.version, true, date),
				/Future or cleared/
			);
		}
		recurring = store.complete(recurring.id, recurring.version, true, '2026-10-17');
		now = new Date('2026-10-17T23:30:00Z');
		assert.equal(today(), '2026-10-18');
		recurring = store.complete(recurring.id, recurring.version, false, '2026-10-17');
		assert.deepEqual(
			recurring.completedDates,
			{},
			'Undo remains available for historical mistakes'
		);
		assert.ok(canCompleteReminder(occurrence(recurring, '2026-10-17'), today()));
		recurring = store.complete(recurring.id, recurring.version, true, '2026-10-18');
		assert.deepEqual(Object.keys(recurring.completedDates!), ['2026-10-18']);
		const future = store.create({ title: 'Tomorrow', list: 'General', dueDate: '2026-10-19' });
		assert.throws(
			() => store.complete(future.id, future.version, true, today()),
			/Future or cleared|does not repeat/
		);
		assert.equal(store.list().find((r) => r.id === future.id)!.completedAt, null);
	} finally {
		store.close();
	}
});

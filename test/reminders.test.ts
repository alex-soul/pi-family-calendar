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
				assert.throws(
					() => store.complete(item.id, item.version, true),
					/Future to-dos|saved item/
				);
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
				/Future to-dos|saved item/
			);
		}
		assert.throws(
			() => store.complete(recurring.id, recurring.version, true, today()),
			/saved item/
		);
		const future = store.create({ title: 'Tomorrow', list: 'General', dueDate: '2026-10-19' });
		assert.throws(() => store.complete(future.id, future.version, true, today()), /saved item/);
		assert.equal(store.list().find((r) => r.id === future.id)!.completedAt, null);
	} finally {
		store.close();
	}
});

test('legacy reset is explicit, preserves settings and never resets new data on reopening', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-reset-'));
	const path = join(directory, 'test.sqlite');
	const old = new DatabaseSync(path);
	old.exec(`CREATE TABLE reminders(id TEXT); INSERT INTO reminders VALUES ('old');
 CREATE TABLE reminder_occurrences(id TEXT);
 CREATE TABLE settings(value TEXT); INSERT INTO settings VALUES ('keep');
 CREATE TABLE grants(id TEXT); INSERT INTO grants VALUES ('old');
 CREATE TABLE receipts(id TEXT); INSERT INTO receipts VALUES ('old'); PRAGMA user_version=5;`);
	old.close();
	assert.throws(() => new SqliteReminders(path), /explicit one-time/);
	let store = new SqliteReminders(path, () => '2026-10-16', { resetLegacy: true });
	try {
		assert.deepEqual(store.list(), []);
		assert.equal(store.database.prepare('SELECT value FROM settings').get()!.value, 'keep');
		assert.equal(store.database.prepare('SELECT count(*) AS n FROM grants').get()!.n, 0);
		assert.equal(store.database.prepare('SELECT count(*) AS n FROM receipts').get()!.n, 0);
		const item = store.create({ title: 'New item', list: 'General', dueDate: null });
		store.close();
		store = new SqliteReminders(path, () => '2026-10-16', { resetLegacy: true });
		assert.deepEqual(store.list(), [item]);
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('times require dates, windows require two ordered same-day times, and identity cannot change', () => {
	const store = new SqliteReminders(':memory:', () => '2026-10-16');
	const base = { title: 'Fixture', list: 'General', dueDate: '2026-10-16' };
	try {
		for (const extra of [
			{ dueTime: '25:00' },
			{ dueTime: '8:00' },
			{ kind: 'note', showFrom: '07:00' },
			{ kind: 'note', showFrom: '09:00', showUntil: '07:00' },
			{ kind: 'note', showFrom: '07:00', showUntil: '07:00' }
		])
			assert.throws(() => validateReminder({ ...base, ...extra }), ReminderError);
		const item = store.create({ ...base, dueTime: '08:00' });
		assert.equal(store.update(item.id, item.version, { ...item, dueDate: null }).dueTime, null);
		const note = store.create({
			...base,
			kind: 'note',
			dueTime: '08:00',
			showFrom: '07:00',
			showUntil: '09:00'
		});
		assert.equal(note.dueTime, null);
		const todo = store.update(note.id, note.version, { ...note, kind: 'todo' });
		assert.equal(todo.showFrom, null);
		assert.throws(
			() =>
				store.update(todo.id, todo.version, {
					...todo,
					repeat: { frequency: 'daily', interval: 1, until: null }
				}),
			/separate/
		);
	} finally {
		store.close();
	}
});

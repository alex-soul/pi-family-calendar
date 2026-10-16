import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { SqliteReminders, validateReminder } from '../src/lib/server/reminders.ts';
import { occursOn, managementOccurrences, nextOccurrence } from '../src/lib/recurrence.ts';
import { remindersForDay } from '../src/lib/display.ts';
import { reminderGroups } from '../src/lib/reminder-management.ts';
import type { Reminder, RepeatRule } from '../src/lib/domain.ts';

const series = (
	frequency: RepeatRule['frequency'],
	interval = 1,
	dueDate = '2026-10-16'
): Reminder => ({
	id: 'series',
	title: 'Pack a bag',
	kind: 'todo',
	list: 'General',
	dueDate,
	completedAt: null,
	version: 1,
	repeat: { frequency, interval, until: null },
	completedDates: {}
});

test('repeat dates handle DST, weekdays, fortnightly schedules and inclusive end dates', () => {
	const daily = series('daily', 2, '2026-10-24');
	assert.equal(occursOn(daily, '2026-10-25'), false);
	assert.equal(occursOn(daily, '2026-10-26'), true);
	assert.equal(occursOn(series('weekdays'), '2026-10-17'), false);
	assert.equal(occursOn(series('weekdays'), '2026-10-19'), true);
	const fortnightly = series('weekly', 2);
	assert.equal(occursOn(fortnightly, '2026-10-23'), false);
	assert.equal(occursOn(fortnightly, '2026-10-30'), true);
	fortnightly.repeat!.until = '2026-10-30';
	assert.equal(nextOccurrence(fortnightly, '2026-10-30')?.dueDate, '2026-10-30');
	assert.equal(nextOccurrence(fortnightly, '2026-10-31'), null);
	assert.equal(occursOn(fortnightly, '2026-10-02'), false);
});

test('monthly repeats clamp short months without losing their original anchor', () => {
	const monthly = series('monthly', 1, '2028-01-31');
	for (const date of ['2028-02-29', '2028-03-31', '2028-04-30']) assert.ok(occursOn(monthly, date));
	assert.equal(occursOn(monthly, '2028-03-29'), false);
	assert.equal(
		nextOccurrence(series('monthly', 52, '2026-01-31'), '2026-02-01')?.dueDate,
		'2030-05-31'
	);
	assert.equal(nextOccurrence(series('weekly', 1, '9999-12-30'), '9999-12-31'), null);
});

test('day projections count occurrences separately and notes never inflate checkboxes', () => {
	const todo = series('daily');
	todo.completedDates = { '2026-10-16': '2026-10-16T12:00:00Z' };
	const note = { ...series('daily'), id: 'note', kind: 'note' as const };
	assert.equal(remindersForDay([todo, note], '2026-10-16').completed, 1);
	assert.equal(remindersForDay([todo, note], '2026-10-16').total, 1);
	assert.equal(remindersForDay([todo, note], '2026-10-17').completed, 0);
	assert.equal(remindersForDay([todo], '2026-10-15').items.length, 0);
});

test('management skips completed dates and retains ended series and completion history', () => {
	const todo = series('daily');
	todo.completedDates = { '2026-10-16': 'done', '2026-10-17': 'done' };
	assert.equal(managementOccurrences([todo], '2026-10-16', 'active')[0].dueDate, '2026-10-18');
	todo.repeat!.until = '2026-10-17';
	assert.equal(managementOccurrences([todo], '2026-10-18', 'active').length, 0);
	const all = managementOccurrences([todo], '2026-10-18', 'all');
	assert.equal(all.length, 3);
	assert.ok(reminderGroups(all, '2026-10-18', 'all').find((g) => g.title === 'Ended repeats'));
	const last = series('daily', 1, '9999-12-31');
	last.completedDates = { '9999-12-31': 'done' };
	assert.equal(managementOccurrences([last], '9999-12-31', 'active').length, 0);
});

test('recurrence persistence, occurrence undo, stale writes and schedule changes are atomic', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-repeat-'));
	const path = join(directory, 'test.sqlite');
	let store = new SqliteReminders(path);
	try {
		let item = store.create(series('daily'));
		assert.throws(() => store.complete(item.id, item.version, true), /occurrence/);
		const stale = item;
		item = store.complete(item.id, item.version, true, '2026-10-16');
		item = store.complete(item.id, item.version, true, '2026-10-17');
		assert.equal(item.completedAt, null);
		assert.throws(
			() => store.complete(item.id, stale.version, false, '2026-10-16'),
			/another screen/
		);
		assert.throws(
			() => store.update(item.id, stale.version, { ...item, repeat: null }),
			/another screen/
		);
		assert.equal(Object.keys(store.list()[0].completedDates!).length, 2);
		item = store.complete(item.id, item.version, false, '2026-10-17');
		item = store.update(item.id, item.version, { ...item, title: 'Updated title' });
		assert.equal(Object.keys(item.completedDates!).length, 1);
		store.close();
		store = new SqliteReminders(path);
		assert.deepEqual(store.list()[0], item);
		item = store.update(item.id, item.version, {
			...item,
			repeat: { ...item.repeat!, interval: 2 }
		});
		assert.deepEqual(item.completedDates, {});
		assert.throws(() => store.complete(item.id, item.version, true, '2026-10-17'), /occurrence/);
		item = store.complete(item.id, item.version, true, '2026-10-18');
		item = store.update(item.id, item.version, { ...item, kind: 'note' });
		assert.deepEqual(item.completedDates, {});
		assert.throws(() => store.complete(item.id, item.version, true, '2026-10-18'), /Notes cannot/);
		item = store.update(item.id, item.version, { ...item, kind: 'todo' });
		item = store.complete(item.id, item.version, true, '2026-10-18');
		store.remove(item.id, item.version);
		assert.deepEqual(store.list(), []);
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('recurrence validation rejects invalid schedules instead of saving unusable series', () => {
	const input = series('daily');
	for (const repeat of [
		42,
		{},
		{ frequency: 'yearly', interval: 1, until: null },
		{ frequency: 'daily', interval: 0, until: null },
		{ frequency: 'daily', interval: 53, until: null },
		{ frequency: 'weekdays', interval: 2, until: null },
		{ frequency: 'weekly', interval: 1, until: '2026-10-15' }
	]) {
		assert.throws(() => validateReminder({ ...input, repeat }));
	}
	assert.throws(() => validateReminder({ ...input, dueDate: null }));
});

test('v3 upgrade preserves existing notes and completed todos while normalising General', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-v3-'));
	const path = join(directory, 'test.sqlite');
	const old = new DatabaseSync(path);
	old.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY, title TEXT NOT NULL, list TEXT NOT NULL, dueDate TEXT, completedAt TEXT, version INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'todo');
 INSERT INTO reminders VALUES ('note', 'Keep note', 'Personal 1', NULL, NULL, 5, 'Details', 'note');
 INSERT INTO reminders VALUES ('todo', 'Keep completion', 'Household', '2026-10-16', '2026-10-16T12:00:00Z', 8, '', 'todo');
 PRAGMA user_version = 3;`);
	old.close();
	const store = new SqliteReminders(path);
	try {
		const items = store.list();
		assert.equal(items.length, 2);
		assert.ok(items.every((item) => item.list === 'General' && item.repeat === null));
		assert.equal(items.find((item) => item.id === 'note')?.kind, 'note');
		assert.equal(items.find((item) => item.id === 'note')?.version, 5);
		assert.equal(items.find((item) => item.id === 'todo')?.completedAt, '2026-10-16T12:00:00Z');
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

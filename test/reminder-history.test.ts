import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { occurrence, oldestOutstanding, managementOccurrences } from '../src/lib/recurrence.ts';
import { overdueReminders, remindersForDay, scheduleFocusIndex } from '../src/lib/display.ts';
import { combinedScheduleRows } from '../src/lib/schedule.ts';
import type { CalendarSnapshot } from '../src/lib/domain.ts';

test('One overdue repeat survives gaps; completion clears backlog, keeps fixed future and supports undo after restart', () => {
	const dir = mkdtempSync(join(tmpdir(), 'reminder-history-'));
	const path = join(dir, 'test.sqlite');
	let store = new SqliteReminders(path, () => '2026-10-17');
	try {
		let item = store.create({
			title: 'Six-month task',
			list: 'General',
			dueDate: '2025-01-01',
			repeat: { frequency: 'monthly', interval: 6, until: null }
		});
		assert.equal(overdueReminders([item], '2026-10-17').length, 1);
		assert.equal(oldestOutstanding(item, '2026-10-17')?.dueDate, '2025-01-01');
		item = store.complete(item.id, item.version, true, '2025-01-01');
		assert.equal(Object.keys(item.completedDates!).length, 1);
		assert.ok(occurrence(item, '2026-07-01').completedAt);
		assert.ok(occurrence(item, '2025-01-01').clearedAt);
		assert.equal(occurrence(item, '2025-07-01').completedAt, null);
		assert.ok(occurrence(item, '2025-07-01').clearedAt);
		assert.equal(overdueReminders([item], '2026-10-17').length, 0);
		assert.equal(occurrence(item, '2027-01-01').clearedAt, null);
		assert.equal(managementOccurrences([item], '2026-10-17', 'active')[0].dueDate, '2027-01-01');
		assert.throws(() => store.complete(item.id, item.version, true, '2025-07-01'), /cleared/);
		const stale = item.version;
		store.close();
		store = new SqliteReminders(path, () => '2026-10-17');
		assert.deepEqual(store.list()[0], item);
		item = store.complete(item.id, item.version, false, '2026-07-01');
		assert.equal(oldestOutstanding(item, '2026-10-17')?.dueDate, '2025-01-01');
		assert.equal(occurrence(item, '2025-07-01').clearedAt, null);
		assert.throws(() => store.complete(item.id, stale, true, '2025-01-01'), /another screen/);
		assert.throws(() => store.complete(item.id, item.version, true, '2027-01-01'), /Future/);
	} finally {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('Completing today clears older misses without replacing real historical completions; ended repeats remain overdue', () => {
	const store = new SqliteReminders(':memory:', () => '2026-10-17');
	try {
		let item = store.create({
			title: 'Daily',
			list: 'General',
			dueDate: '2026-10-14',
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		item = store.complete(item.id, item.version, true, '2026-10-17');
		assert.ok(occurrence(item, '2026-10-14').clearedAt);
		assert.ok(occurrence(item, '2026-10-17').completedAt);
		assert.equal(occurrence(item, '2026-10-18').clearedAt, null);
		assert.equal(remindersForDay([item], '2026-10-15').items.length, 1);
		assert.equal(remindersForDay([item], '2026-10-15').completed, 0);
		const ended = store.create({
			title: 'Ended',
			list: 'General',
			dueDate: '2026-10-01',
			repeat: { frequency: 'daily', interval: 1, until: '2026-10-03' }
		});
		assert.equal(managementOccurrences([ended], '2026-10-17', 'active')[0].dueDate, '2026-10-01');
		const note = store.create({
			title: 'Note',
			kind: 'note',
			list: 'General',
			dueDate: '2026-10-01',
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		assert.equal(overdueReminders([item, ended, note], '2026-10-17').length, 1);
	} finally {
		store.close();
	}
});

test('Schedule merges all reminder history after events, including reminder-only days and overlapping pages', () => {
	const store = new SqliteReminders(':memory:', () => '2026-10-17');
	try {
		let todo = store.create({ title: 'Done', list: 'General', dueDate: '2026-10-16' });
		todo = store.complete(todo.id, todo.version, true);
		store.create({ title: 'Note only day', kind: 'note', list: 'General', dueDate: '2026-10-17' });
		store.create({ title: 'Future', list: 'General', dueDate: '2026-10-18' });
		store.create({ title: 'Anytime excluded', list: 'General', dueDate: null });
		const page: CalendarSnapshot = {
			source: 'unconnected',
			calendars: [],
			events: [
				{
					id: 'e',
					calendarId: 'c',
					title: 'Event',
					kind: 'all-day',
					startDate: '2026-10-16',
					endDate: '2026-10-17'
				}
			],
			from: '2026-10-16',
			to: '2026-10-19',
			timeZone: 'Europe/London',
			fetchedAt: 'fixture'
		};
		const rows = combinedScheduleRows([page, page], [], store.list());
		assert.equal(rows.length, 4);
		assert.equal(rows[0].event?.id, 'e');
		assert.ok(rows[1].reminder?.completedAt);
		assert.equal(rows[2].reminder?.title, 'Note only day');
		assert.equal(rows[3].reminder?.title, 'Future');
		assert.equal(scheduleFocusIndex(rows, '2026-10-17', new Date('2026-10-17T12:00:00Z')), 2);
		assert.equal(combinedScheduleRows([page], ['c'], store.list()).length, 3);
	} finally {
		store.close();
	}
});

test('v4 migration preserves historical completions without clearing missed dates retroactively', () => {
	const dir = mkdtempSync(join(tmpdir(), 'reminder-v4-'));
	const path = join(dir, 'test.sqlite');
	const old = new DatabaseSync(path);
	old.exec(`CREATE TABLE reminders(id TEXT PRIMARY KEY,title TEXT,list TEXT,dueDate TEXT,completedAt TEXT,version INTEGER,notes TEXT,kind TEXT,repeat TEXT);
 CREATE TABLE reminder_occurrences(reminderId TEXT REFERENCES reminders(id) ON DELETE CASCADE,date TEXT,completedAt TEXT,PRIMARY KEY(reminderId,date));
 INSERT INTO reminders VALUES('r','Legacy repeat','General','2026-10-01',NULL,7,'','todo','{"frequency":"daily","interval":1,"until":null}');
 INSERT INTO reminder_occurrences VALUES('r','2026-10-02','2026-10-02T12:00:00Z'); PRAGMA user_version=4;`);
	old.close();
	const store = new SqliteReminders(path, () => '2026-10-17');
	try {
		let item = store.list()[0];
		assert.equal(item.version, 7);
		assert.equal(item.completedDates!['2026-10-02'], '2026-10-02T12:00:00Z');
		assert.equal(occurrence(item, '2026-10-01').clearedAt, null);
		item = store.complete(item.id, item.version, true, '2026-10-01');
		assert.equal(item.completedDates!['2026-10-02'], '2026-10-02T12:00:00Z');
		assert.equal(occurrence(item, '2026-10-02').clearedAt, null);
		assert.ok(occurrence(item, '2026-10-03').clearedAt);
		assert.throws(
			() => store.complete(item.id, item.version, true, '2026-10-02'),
			/already completed/
		);
	} finally {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

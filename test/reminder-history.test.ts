import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { overdueReminders, remindersForDay, scheduleFocusIndex } from '../src/lib/display.ts';
import { combinedScheduleRows } from '../src/lib/schedule.ts';
import type { CalendarSnapshot } from '../src/lib/domain.ts';

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

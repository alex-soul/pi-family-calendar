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
	repeat: { frequency, interval, until: null }
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

test('future previews never reconstruct today or past and templates remain manageable', () => {
	const template = series('daily');
	assert.equal(remindersForDay([template], '2026-10-16', '2026-10-17').items.length, 0);
	assert.equal(remindersForDay([template], '2026-10-17', '2026-10-17').items.length, 0);
	const future = remindersForDay([template], '2026-10-18', '2026-10-17').items[0];
	assert.equal(future.id, template.id);
	assert.equal(future.preview, true);
	assert.equal(future.completedAt, null);
	assert.equal(managementOccurrences([template], '2026-10-17', 'active')[0].dueDate, '2026-10-18');
	template.repeat!.until = '2026-10-17';
	assert.equal(managementOccurrences([template], '2026-10-18', 'all')[0].seriesEnded, true);
	assert.deepEqual(managementOccurrences([template], '2026-10-18', 'completed'), []);
});

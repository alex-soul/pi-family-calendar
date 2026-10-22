import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleRange, scheduleRows, combinedScheduleRows } from '../src/lib/schedule.ts';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import type { CalendarEvent, CalendarSnapshot } from '../src/lib/domain.ts';
const span: CalendarEvent = {
	id: 'trip',
	calendarId: 'family',
	title: 'Trip',
	kind: 'all-day',
	startDate: '2026-11-07',
	endDate: '2026-11-11'
};
const instance = (date: string): CalendarEvent => ({
	id: `series-${date}`,
	calendarId: 'family',
	title: 'Weekly club',
	kind: 'timed',
	start: `${date}T10:00:00Z`,
	end: `${date}T11:00:00Z`
});
const page = (from: string, to: string, events: CalendarEvent[]): CalendarSnapshot => ({
	source: 'demo',
	from,
	to,
	events,
	calendars: [],
	timeZone: 'Europe/London',
	fetchedAt: '2026-10-16T10:00:00Z'
});
test('fresh reminder range removes deleted items and templates from cached schedule pages', () => {
	const repo = new SqliteReminders(':memory:', () => '2026-10-20');
	try {
		const item = repo.create({
			title: 'Removed note',
			kind: 'note',
			list: 'General',
			dueDate: '2026-10-22'
		});
		const template = repo.create({
			title: 'Removed template',
			kind: 'todo',
			list: 'General',
			dueDate: '2026-10-20',
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		const cached = { ...page('2026-10-20', '2026-11-01', []), reminders: [item, template] };
		assert.ok(combinedScheduleRows([cached], [], [item, template], '2026-10-21', cached).length);
		assert.deepEqual(combinedScheduleRows([cached], [], [], '2026-10-21', cached), []);
	} finally {
		repo.close();
	}
});
test('schedule pages are contiguous six-week windows, with a bounded final page', () => {
	assert.deepEqual(scheduleRange('2026-11-09'), { from: '2026-11-09', to: '2026-12-21' });
	assert.deepEqual(scheduleRange('2099-12-20'), { from: '2099-12-20', to: '2100-01-01' });
	for (const invalid of ['2026-02-30', '2100-01-01', '1899-12-31', 'bad'])
		assert.throws(() => scheduleRange(invalid));
});
test('schedule preserves recurring instances and renders spanning events once per occupied day across pages', () => {
	const rows = scheduleRows([
		page('2026-11-01', '2026-11-09', [span, instance('2026-11-02')]),
		page('2026-11-09', '2026-12-21', [
			span,
			instance('2026-11-09'),
			instance('2026-11-09'),
			instance('2026-12-14')
		])
	]);
	assert.deepEqual(
		rows.filter((r) => r.event.id === 'trip').map((r) => r.date),
		['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']
	);
	assert.equal(rows.filter((r) => r.event.title === 'Weekly club').length, 3);
	assert.equal(rows.at(-1)?.date, '2026-12-14');
});
test('refresh replaces a window authoritatively, including cancellations and moved instances', () => {
	const first = page('2026-11-01', '2026-11-09', [span]);
	const cancelled = page('2026-11-09', '2026-12-21', []);
	assert.deepEqual(
		scheduleRows([first, cancelled]).map((r) => r.date),
		['2026-11-07', '2026-11-08']
	);
	const moved = {
		...instance('2026-11-09'),
		start: '2026-11-10T10:00:00Z',
		end: '2026-11-10T11:00:00Z'
	};
	assert.deepEqual(
		scheduleRows([first, page(cancelled.from, cancelled.to, [moved])])
			.filter((r) => r.event.id === moved.id)
			.map((r) => r.date),
		['2026-11-10']
	);
	assert.deepEqual(scheduleRows([first, cancelled], ['family']), []);
});
test('timed midnight endings and DST remain correct at a batch boundary', () => {
	const event: CalendarEvent = {
		...instance('2026-10-24'),
		start: '2026-10-24T22:00:00Z',
		end: '2026-10-26T00:00:00Z'
	};
	assert.deepEqual(
		scheduleRows([
			page('2026-10-24', '2026-10-25', [event]),
			page('2026-10-25', '2026-11-01', [event])
		]).map((r) => r.date),
		['2026-10-24', '2026-10-25']
	);
	assert.deepEqual(scheduleRows([page('2026-11-01', '2026-12-13', [])]), []);
});

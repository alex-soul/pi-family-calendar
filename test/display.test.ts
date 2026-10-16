import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaFocusIndex, remindersForDay, scheduleFocusIndex } from '../src/lib/display.ts';
import type { CalendarEvent, Reminder } from '../src/lib/domain.ts';

const timed = (id: string, start: string, end: string): CalendarEvent => ({
	id,
	title: id,
	calendarId: 'test',
	kind: 'timed',
	start,
	end
});
const events = [
	timed('finished', '2026-10-16T08:00:00Z', '2026-10-16T09:00:00Z'),
	timed('ongoing', '2026-10-16T09:30:00Z', '2026-10-16T11:00:00Z'),
	timed('overlap', '2026-10-16T10:00:00Z', '2026-10-16T10:30:00Z'),
	timed('next', '2026-10-16T12:00:00Z', '2026-10-16T13:00:00Z')
];
test('agenda focus retains ongoing overlaps and advances only after their end', () => {
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T10:15:00Z')), 1);
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T11:00:00Z')), 3);
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T13:00:00Z')), events.length);
	assert.equal(events.length, 4, 'past events must remain available to scroll back to');
});
test('schedule focuses a current timed event before today all-day and falls forward to the next date', () => {
	const allDay: CalendarEvent = {
		id: 'all',
		title: 'All day',
		calendarId: 'test',
		kind: 'all-day',
		startDate: '2026-10-16',
		endDate: '2026-10-18'
	};
	const rows = [
		{ date: '2026-10-16', event: allDay },
		...events.map((event) => ({ date: '2026-10-16', event })),
		{ date: '2026-10-17', event: allDay }
	];
	assert.equal(scheduleFocusIndex(rows, '2026-10-16', new Date('2026-10-16T10:15:00Z')), 2);
	assert.equal(scheduleFocusIndex(rows, '2026-10-16', new Date('2026-10-16T14:00:00Z')), 5);
	assert.equal(scheduleFocusIndex([], '2026-10-16', new Date()), 0);
});
test('day count excludes future, undated and overdue items but includes completed items due that day', () => {
	const item = (
		id: string,
		dueDate: string | null,
		completedAt: string | null = null
	): Reminder => ({ id, title: id, list: 'Household', dueDate, completedAt, version: 1 });
	const items = [
		item('due', '2026-10-16'),
		item('done', '2026-10-16', '2026-10-16T09:00:00Z'),
		item('future', '2026-10-17'),
		item('overdue', '2026-10-15'),
		item('undated', null),
		item('old done', '2026-10-14', '2026-10-14T09:00:00Z')
	];
	const result = remindersForDay(items, '2026-10-16');
	assert.equal(result.total, 2);
	assert.equal(result.completed, 1);
	assert.deepEqual(
		result.items.map((r) => r.id),
		['due', 'done']
	);
	assert.equal(remindersForDay(items, '2026-10-18').total, 0);
});

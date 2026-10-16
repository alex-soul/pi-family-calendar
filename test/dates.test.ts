import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	addDays,
	dateKey,
	eventsOn,
	isDateKey,
	isOngoing,
	isPast,
	monthGrid,
	occursOn
} from '../src/lib/dates.ts';
import type { CalendarEvent } from '../src/lib/domain.ts';

const timed = (start: string, end: string): CalendarEvent => ({
	id: 'event',
	calendarId: 'test',
	title: 'Test',
	kind: 'timed',
	start,
	end
});
test('date arithmetic crosses leap days and year boundaries without local clock assumptions', () => {
	assert.equal(addDays('2024-02-28', 1), '2024-02-29');
	assert.equal(addDays('2026-12-31', 1), '2027-01-01');
	assert.equal(isDateKey('2026-02-29'), false);
	assert.equal(isDateKey('2024-02-29'), true);
	assert.equal(monthGrid('2026-11-15')[0], '2026-10-26');
	assert.equal(monthGrid('2026-11-15').length, 42);
});
test('all-day ranges retain exclusive end dates in every display zone', () => {
	const event: CalendarEvent = {
		id: 'all',
		calendarId: 'test',
		title: 'Trip',
		kind: 'all-day',
		startDate: '2026-10-24',
		endDate: '2026-10-27'
	};
	for (const zone of ['Europe/London', 'America/Los_Angeles', 'Pacific/Auckland']) {
		assert.equal(occursOn(event, '2026-10-24', zone), true);
		assert.equal(occursOn(event, '2026-10-26', zone), true);
		assert.equal(occursOn(event, '2026-10-27', zone), false);
	}
});
test('timed events use the display zone, including midnight and DST changes', () => {
	assert.equal(dateKey('2026-10-16T23:30:00Z', 'Europe/London'), '2026-10-17');
	const midnight = timed('2026-10-16T22:00:00Z', '2026-10-16T23:00:00Z');
	assert.equal(occursOn(midnight, '2026-10-16', 'Europe/London'), true);
	assert.equal(occursOn(midnight, '2026-10-17', 'Europe/London'), false);
	const dst = timed('2026-10-25T00:30:00Z', '2026-10-25T02:30:00Z');
	assert.equal(occursOn(dst, '2026-10-25', 'Europe/London'), true);
	const overnight = timed('2026-03-28T23:00:00Z', '2026-03-29T02:00:00Z');
	assert.equal(occursOn(overnight, '2026-03-29', 'Europe/London'), true);
});
test('ongoing events stay visible until their end and browsing old days does not hide them', () => {
	const event = timed('2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z');
	assert.equal(isOngoing(event, new Date('2026-10-16T09:30:00Z')), true);
	assert.equal(isPast(event, '2026-10-16', new Date('2026-10-16T09:30:00Z'), 'UTC'), false);
	assert.equal(isPast(event, '2026-10-16', new Date('2026-10-16T10:00:00Z'), 'UTC'), true);
	assert.equal(isPast(event, '2026-10-16', new Date('2026-10-17T10:00:00Z'), 'UTC'), false);
});
test('three simultaneous events remain three independently reachable items', () => {
	const events = ['A', 'B', 'C'].map((id) => ({
		...timed('2026-10-16T09:00:00Z', '2026-10-16T10:00:00Z'),
		id,
		title: id
	}));
	assert.deepEqual(
		eventsOn(events, '2026-10-16', 'UTC').map((e) => e.id),
		['A', 'B', 'C']
	);
});

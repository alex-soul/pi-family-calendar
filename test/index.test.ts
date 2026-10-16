import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsOn, indexEvents } from '../src/lib/dates.ts';
import type { CalendarEvent } from '../src/lib/domain.ts';

test('the display index preserves day membership and sorts by instants, not written offsets', () => {
	const events: CalendarEvent[] = [
		{
			id: 'later',
			calendarId: 'test',
			title: 'Later',
			kind: 'timed',
			start: '2026-10-16T09:00:00Z',
			end: '2026-10-16T10:00:00Z'
		},
		{
			id: 'earlier',
			calendarId: 'test',
			title: 'Earlier',
			kind: 'timed',
			start: '2026-10-16T10:00:00+02:00',
			end: '2026-10-16T11:00:00+02:00'
		},
		{
			id: 'trip',
			calendarId: 'test',
			title: 'Trip',
			kind: 'all-day',
			startDate: '2026-10-01',
			endDate: '2026-11-01'
		}
	];
	const index = indexEvents(events, '2026-10-16', '2026-10-18', 'Europe/London');
	assert.equal(index.size, 2);
	assert.deepEqual(
		index.get('2026-10-16')?.map((e) => e.id),
		['trip', 'earlier', 'later']
	);
	assert.deepEqual(index.get('2026-10-16'), eventsOn(events, '2026-10-16', 'Europe/London'));
	assert.deepEqual(
		index.get('2026-10-17')?.map((e) => e.id),
		['trip']
	);
	assert.equal(index.has('2026-10-18'), false);
});

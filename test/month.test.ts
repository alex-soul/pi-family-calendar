import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	monthWeek,
	eventDates,
	dayTime,
	isBannerEvent,
	eventDayNumber,
	scheduleTime,
	bannerTime
} from '../src/lib/month.ts';
import { monthGrid, indexEvents } from '../src/lib/dates.ts';
import type { CalendarEvent } from '../src/lib/domain.ts';
const all = (id: string, startDate: string, endDate: string): CalendarEvent => ({
	id,
	title: id,
	calendarId: 'fixture',
	kind: 'all-day',
	startDate,
	endDate
});
const timed = (id: string, start: string, end: string): CalendarEvent => ({
	id,
	title: id,
	calendarId: 'fixture',
	kind: 'timed',
	start,
	end
});
const zone = 'Europe/London';
test('month spans preserve exclusive ends, clip at week boundaries and signal continuation', () => {
	const e = all('trip', '2026-10-02', '2026-10-07');
	const grid = monthGrid('2026-10-01');
	const first = monthWeek([e], grid.slice(0, 7), zone)[0];
	assert.deepEqual(
		[first.start, first.end, first.continuesBefore, first.continuesAfter],
		[4, 6, false, true]
	);
	const second = monthWeek([e], grid.slice(7, 14), zone)[0];
	assert.deepEqual(
		[second.start, second.end, second.continuesBefore, second.continuesAfter],
		[0, 1, true, false]
	);
	assert.equal(
		monthWeek([all('single', '2026-10-01', '2026-10-02')], grid.slice(0, 7), zone)[0].end,
		3
	);
});
test('overlapping spans never share a lane on the same date; all overflow remains reachable', () => {
	const events = [
		all('a', '2026-10-01', '2026-10-05'),
		all('b', '2026-10-02', '2026-10-04'),
		all('c', '2026-10-02', '2026-10-03'),
		timed('d', '2026-10-02T10:00:00+01:00', '2026-10-02T11:00:00+01:00')
	];
	const dates = monthGrid('2026-10-01').slice(0, 7),
		segments = monthWeek(events, dates, zone);
	const index = indexEvents(events, dates[0], '2026-10-05', zone);
	dates.forEach((date, col) => {
		const covering = segments.filter((s) => s.start <= col && s.end >= col);
		assert.equal(new Set(covering.map((s) => s.lane)).size, covering.length);
		assert.deepEqual(
			covering.map((s) => s.event.id).sort(),
			(index.get(date) || []).map((e) => e.id).sort()
		);
	});
	assert.equal(segments.filter((s) => s.lane >= 3).length, 1);
	assert.equal(
		monthWeek(
			events.filter((e) => e.id !== 'a'),
			dates,
			zone
		).filter((s) => s.lane >= 3).length,
		0
	);
});
test('timed multi-day labels describe each day and midnight does not create another date', () => {
	const e = timed('camp', '2026-10-16T17:00:00+01:00', '2026-10-18T18:00:00+01:00');
	assert.equal(dayTime(e, '2026-10-16', zone).summary, '17:00 →');
	assert.equal(dayTime(e, '2026-10-17', zone).summary, 'All day · continues');
	assert.equal(dayTime(e, '2026-10-18', zone).summary, 'Until 18:00');
	const midnight = timed('late', '2026-10-16T22:00:00+01:00', '2026-10-17T00:00:00+01:00');
	assert.equal(eventDates(midnight, zone).last, '2026-10-16');
	assert.equal(dayTime(midnight, '2026-10-16', zone).summary, '22:00 – 24:00');
});
test('DST and separate recurring occurrences retain correct local dates and independent bars', () => {
	const instances = [
		timed('series_1', '2026-10-19T08:30:00Z', '2026-10-19T09:00:00Z'),
		timed('series_2', '2026-10-26T09:30:00Z', '2026-10-26T10:00:00Z')
	];
	assert.equal(dayTime(instances[0], '2026-10-19', zone).primary, '09:30');
	assert.equal(dayTime(instances[1], '2026-10-26', zone).primary, '09:30');
	const grid = monthGrid('2026-10-01');
	const segments = Array.from({ length: 6 }, (_, w) =>
		monthWeek(instances, grid.slice(w * 7, w * 7 + 7), zone)
	).flat();
	assert.equal(segments.length, 2);
	assert.ok(segments.every((s) => s.start === s.end));
	const crossing = timed('dst', '2026-10-24T23:30:00Z', '2026-10-25T01:30:00Z');
	assert.deepEqual(eventDates(crossing, zone), { first: '2026-10-25', last: '2026-10-25' });
});

test('banner grouping includes timed multi-day events but excludes midnight-ending single-day events', () => {
	const trip = timed('trip', '2026-10-16T17:00:00+01:00', '2026-10-18T18:00:00+01:00');
	assert.equal(isBannerEvent(trip, zone), true);
	assert.equal(isBannerEvent(all('birthday', '2026-10-16', '2026-10-17'), zone), true);
	assert.equal(
		isBannerEvent(timed('late', '2026-10-16T22:00:00+01:00', '2026-10-17T00:00:00+01:00'), zone),
		false
	);
	assert.deepEqual(
		[16, 17, 18].map((d) => bannerTime(trip, `2026-10-${d}`, zone)),
		['17:00', '', 'Until 18:00']
	);
	const events = [trip, timed('meeting', '2026-10-17T10:00:00+01:00', '2026-10-17T11:00:00+01:00')];
	const days = [
		'2026-10-16',
		'2026-10-17',
		'2026-10-18',
		'2026-10-19',
		'2026-10-20',
		'2026-10-21',
		'2026-10-22'
	];
	const strip = monthWeek(
		events.filter((e) => isBannerEvent(e, zone)),
		days,
		zone
	);
	assert.equal(strip.length, 1);
	assert.deepEqual([strip[0].start, strip[0].end], [0, 2]);
	assert.deepEqual(
		events.filter((e) => !isBannerEvent(e, zone)).map((e) => e.id),
		['meeting']
	);
});
test('Schedule uses start/all-day/until labels and calendar-day counts through DST', () => {
	const trip = timed('trip', '2026-10-24T11:30:00+01:00', '2026-10-26T12:30:00Z');
	assert.deepEqual(
		[24, 25, 26].map((d) => scheduleTime(trip, `2026-10-${d}`, zone)),
		['11:30', 'All day', 'Until 12:30']
	);
	assert.deepEqual(
		[24, 25, 26].map((d) => eventDayNumber(trip, `2026-10-${d}`, zone)),
		[
			{ day: 1, total: 3 },
			{ day: 2, total: 3 },
			{ day: 3, total: 3 }
		]
	);
	assert.deepEqual(eventDayNumber(all('away', '2026-10-24', '2026-10-27'), '2026-10-26', zone), {
		day: 3,
		total: 3
	});
	assert.equal(
		scheduleTime(
			timed('instance', '2026-10-26T09:30:00Z', '2026-10-26T10:30:00Z'),
			'2026-10-26',
			zone
		),
		'09:30 – 10:30'
	);
});

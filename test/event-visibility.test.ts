import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenEventKey, hiddenOnDate, parseHiddenEvents } from '../src/lib/event-visibility.ts';
import { monthWeek } from '../src/lib/month.ts';
import type { CalendarEvent } from '../src/lib/domain.ts';
test('hiding matches calendar occurrence and local day; moves/deletions do not leave phantom events', () => {
	const e: CalendarEvent = {
		id: 'one',
		calendarId: 'school',
		title: 'Trip',
		kind: 'all-day',
		startDate: '2026-10-20',
		endDate: '2026-10-23'
	};
	const keys = [hiddenEventKey(e, '2026-10-21')];
	const hidden = (v: CalendarEvent, d: string) => keys.includes(hiddenEventKey(v, d));
	assert.equal(hiddenOnDate([e], '2026-10-21', 'UTC', keys).length, 1);
	assert.equal(
		hiddenOnDate([{ ...e, title: 'Updated' }], '2026-10-21', 'UTC', keys)[0].title,
		'Updated'
	);
	assert.equal(
		hiddenOnDate([{ ...e, startDate: '2026-10-22' }], '2026-10-21', 'UTC', keys).length,
		0
	);
	assert.equal(hiddenOnDate([], '2026-10-21', 'UTC', keys).length, 0);
	assert.equal(hiddenOnDate([{ ...e, id: 'another' }], '2026-10-21', 'UTC', keys).length, 0);
	assert.equal(hiddenOnDate([{ ...e, calendarId: 'other' }], '2026-10-21', 'UTC', keys).length, 0);
	const spans = monthWeek([e], ['2026-10-20', '2026-10-21', '2026-10-22'], 'UTC', hidden);
	assert.deepEqual(
		spans.map((s) => [s.start, s.end]),
		[
			[0, 0],
			[2, 2]
		]
	);
	assert.deepEqual(parseHiddenEvents(JSON.stringify(keys)), keys);
	assert.deepEqual(parseHiddenEvents('[1,{},"bad"]'), []);
});

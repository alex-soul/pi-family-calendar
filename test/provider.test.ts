import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoCalendarProvider, UnconnectedCalendarProvider } from '../src/lib/server/calendar.ts';
import { dateKey, timeLabel } from '../src/lib/dates.ts';
test('sample events are explicit and preserve daytime hours across DST', async () => {
	const snapshot = await new DemoCalendarProvider().snapshot(
		'2026-10-23',
		'2026-10-27',
		'Europe/London'
	);
	assert.equal(snapshot.source, 'demo');
	assert.ok(snapshot.calendars.every((c) => !c.writable));
	const walks = snapshot.events.filter((e) => e.title === 'Morning walk');
	assert.equal(walks.length, 2);
	for (const event of walks) {
		assert.equal(event.kind, 'timed');
		if (event.kind === 'timed') {
			assert.equal(timeLabel(event.start, snapshot.timeZone), '08:15');
			assert.ok(dateKey(event.start, snapshot.timeZone) >= snapshot.from);
		}
	}
});
test('an unconnected provider never supplies fictional availability', async () => {
	const snapshot = await new UnconnectedCalendarProvider().snapshot(
		'2026-10-01',
		'2026-11-01',
		'UTC'
	);
	assert.equal(snapshot.source, 'unconnected');
	assert.deepEqual(snapshot.events, []);
});

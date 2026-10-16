import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seconds, inactivityPreferences, idleReached } from '../src/lib/inactivity.ts';

test('saved blank timers stay disabled and old settings migrate', () => {
	assert.deepEqual(inactivityPreferences({}), { resetScrollSeconds: 15, returnTodaySeconds: 60 });
	assert.deepEqual(inactivityPreferences({ idleSeconds: 0 }), {
		resetScrollSeconds: undefined,
		returnTodaySeconds: undefined
	});
	assert.deepEqual(inactivityPreferences({ idleSeconds: 30 }), {
		resetScrollSeconds: 30,
		returnTodaySeconds: 60
	});
	assert.deepEqual(inactivityPreferences({ resetScrollSeconds: null, returnTodaySeconds: 7 }), {
		resetScrollSeconds: undefined,
		returnTodaySeconds: 7
	});
	assert.deepEqual(inactivityPreferences({ resetScrollSeconds: 4, returnTodaySeconds: null }), {
		resetScrollSeconds: 4,
		returnTodaySeconds: undefined
	});
});
test('timers have independent thresholds and disabled timers never fire', () => {
	assert.equal(idleReached(4999, 5), false);
	assert.equal(idleReached(5000, 5), true);
	assert.equal(idleReached(5000, 60), false);
	assert.equal(idleReached(60000, 60), true);
	assert.equal(idleReached(999999, undefined), false);
});
test('invalid timer values are disabled rather than causing immediate loops', () => {
	for (const value of [null, undefined, '', '15', 0, -1, 0.5, NaN, Infinity])
		assert.equal(seconds(value), undefined);
	assert.equal(seconds(120), 120);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeSteps } from '../src/lib/date-swipe.ts';

test('strip snaps reject jitter, vertical intent and invalid geometry', () => {
	for (const [x, y] of [
		[0, 0],
		[10, 0],
		[20, 150],
		[100, 90]
	])
		assert.equal(swipeSteps(x, y, 2, 180), 0);
	assert.equal(swipeSteps(-200, 0, -1, 0), 0);
});
test('gentle release snaps to nearest actual column boundary', () => {
	assert.equal(swipeSteps(-80, 0, 0, 200), 0);
	assert.equal(swipeSteps(-110, 0, 0, 200), 1);
	assert.equal(swipeSteps(110, 0, 0, 200), -1);
	assert.equal(swipeSteps(-310, 0, 0, 200), 2);
	assert.equal(swipeSteps(-310, 0, 0, 900), 0);
});
test('release velocity adds bounded momentum and reversal brakes', () => {
	assert.equal(swipeSteps(-60, 0, -1, 200), 1);
	assert.equal(swipeSteps(-60, 0, -3, 200), 3);
	assert.equal(swipeSteps(-60, 0, 1, 200), 0);
	assert.equal(swipeSteps(-3000, 0, -20, 200), 3);
});

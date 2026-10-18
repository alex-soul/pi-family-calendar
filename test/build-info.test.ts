import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfo } from '../src/lib/server/build-info.ts';

test('numeric GitHub prerelease versions retain their explicit release channel', () => {
	const previous = process.env.APP_RELEASE_CHANNEL;
	try {
		process.env.APP_RELEASE_CHANNEL = 'prerelease';
		assert.equal(buildInfo().channel, 'Prerelease');
		process.env.APP_RELEASE_CHANNEL = 'release';
		assert.equal(buildInfo().channel, 'Release');
		process.env.APP_RELEASE_CHANNEL = 'development';
		assert.equal(buildInfo().channel, 'Development');
	} finally {
		if (previous === undefined) delete process.env.APP_RELEASE_CHANNEL;
		else process.env.APP_RELEASE_CHANNEL = previous;
	}
});

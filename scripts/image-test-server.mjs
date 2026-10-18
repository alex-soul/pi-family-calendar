// Mounted only into the disposable, network-isolated image smoke container.
import assert from 'node:assert/strict';
import { existsSync, renameSync } from 'node:fs';
assert.equal(process.env.CALENDAR_IMAGE_TEST, '1');
assert.equal(process.env.GOOGLE_SYNC_ENABLED, 'false');
assert.equal(process.env.DATA_DIR, '/app/data');
await import('/app/scripts/serve.mjs');
setInterval(() => {
	if (existsSync('/app/data/request-test-exit')) {
		renameSync('/app/data/request-test-exit', '/app/data/test-exit-completed');
		process.exit(1);
	}
}, 200).unref();

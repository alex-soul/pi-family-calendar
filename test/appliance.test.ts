import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	displayRequest,
	powerOwner,
	socketRequest,
	applianceStatus
} from '../src/lib/server/appliance.ts';
import { requiresAdmin } from '../src/lib/server/admin.ts';

test('appliance pages and APIs never inherit display or QR authorization', () => {
	for (const path of ['/admin/screen', '/api/admin/appliance']) {
		assert.ok(requiresAdmin(path, 'GET'));
		assert.ok(requiresAdmin(path, 'POST'));
	}
	for (const admin of [
		{ unlocked: true, pinEnabled: false },
		{ unlocked: false, pinEnabled: true }
	])
		assert.throws(() => powerOwner(admin, 'a'.repeat(64)), /PIN/);
	assert.throws(() => powerOwner({ unlocked: true, pinEnabled: true }), /PIN/);
	assert.notEqual(powerOwner({ unlocked: true, pinEnabled: true }, 'a'.repeat(64)), 'a'.repeat(64));
});

test('display mutation accepts only bounded values and fixed actions', () => {
	assert.deepEqual(displayRequest({ action: 'sleep' }), { action: 'sleep' });
	for (const brightness of [0, 101, 45.5, true, '70'])
		assert.throws(() =>
			displayRequest({
				action: 'settings',
				settings: { brightness, autoBlank: true, idleMinutes: 10 }
			})
		);
	for (const input of [{ action: 'reboot' }, { action: 'wake', shell: 'anything' }, null])
		assert.throws(() => displayRequest(input));
});

test('unconfigured optional appliance reports no fabricated host health', async () => {
	const before = process.env.APPLIANCE_SOCKET;
	delete process.env.APPLIANCE_SOCKET;
	try {
		assert.deepEqual(await applianceStatus(), {
			state: 'not-configured',
			host: null,
			display: null,
			powerEnabled: false
		});
	} finally {
		if (before) process.env.APPLIANCE_SOCKET = before;
	}
});

test('local bridge client is bounded and never retries an ambiguous submission', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-socket-'));
	const path =
		process.platform === 'win32'
			? `\\\\.\\pipe\\calendar-${randomUUID()}`
			: join(directory, 'bridge.sock');
	let calls = 0;
	const server = createServer((socket) => {
		socket.once('data', () => {
			calls++;
			socket.end();
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	try {
		await assert.rejects(
			socketRequest(path, 'a'.repeat(64), { kind: 'power' }),
			/Check its status/
		);
		assert.equal(calls, 1);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		rmSync(directory, { recursive: true, force: true });
	}
});

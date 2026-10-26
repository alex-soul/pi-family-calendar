import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
	AdminAccess,
	AdminError,
	SESSION_SECONDS,
	requiresAdmin
} from '../src/lib/server/admin.ts';

test('PIN is optional; enabling, rotating, expiry and locking revoke the right sessions', async () => {
	let now = 100_000;
	const store = new AdminAccess(':memory:', () => now);
	try {
		assert.ok(store.authorized());
		const first = await store.configure(undefined, '123456');
		assert.ok(first);
		assert.equal(store.authorized(), false);
		assert.ok(store.authorized(first!));
		const other = await store.login('123456');
		await assert.rejects(
			store.configure('123456', '654321'),
			(e: unknown) => e instanceof AdminError && e.status === 401
		);
		await assert.rejects(store.configure('000000', '654321', first!), /Incorrect/);
		const rotated = await store.configure('123456', '654321', first!);
		assert.equal(store.authorized(first!), false);
		assert.equal(store.authorized(other!), false);
		assert.ok(store.authorized(rotated!));
		store.logout(rotated!);
		assert.equal(store.authorized(rotated!), false);
		const session = await store.login('654321');
		now += SESSION_SECONDS * 1000;
		assert.equal(store.authorized(session!), false);
		const again = await store.login('654321');
		await store.configure('654321', null, again!);
		assert.equal(store.enabled(), false);
		assert.ok(store.authorized());
	} finally {
		store.close();
	}
});

test('PIN and throttling survive restart; storage contains only salted hashes and session hashes', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-admin-'));
	const path = join(directory, 'admin.sqlite');
	let now = 100_000;
	let store = new AdminAccess(path, () => now);
	try {
		const token = await store.configure(undefined, '123456');
		const reader = new DatabaseSync(path);
		const state = reader.prepare('SELECT * FROM access').get()!;
		assert.notEqual(state.hash, '123456');
		assert.equal(String(state.hash).length, 128);
		assert.equal(String(state.salt).length, 32);
		assert.notEqual(reader.prepare('SELECT token FROM sessions').get()!.token, token);
		reader.close();
		for (let i = 0; i < 5; i++) await assert.rejects(store.login('999999'), /Incorrect/);
		store.close();
		store = new AdminAccess(path, () => now);
		assert.ok(store.authorized(token!));
		await assert.rejects(
			store.login('123456'),
			(e: unknown) => e instanceof AdminError && e.status === 429
		);
		now += 60_000;
		assert.ok(await store.login('123456'));
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('malformed PINs and concurrent configuration cannot bypass access protection', async () => {
	const store = new AdminAccess(':memory:');
	try {
		for (const pin of ['', 123456, '12345', '1234567890123', 'abcdef'])
			await assert.rejects(store.configure(null, pin));
		const first = store.configure(null, '123456');
		await assert.rejects(
			store.configure(null, '654321'),
			(e: unknown) => e instanceof AdminError && e.status === 429
		);
		await first;
		assert.ok(await store.login('123456'));
	} finally {
		store.close();
	}
});

test('admin pages, Google metadata/callbacks and writes are protected; completion has a narrow exception', () => {
	for (const route of [
		'/admin',
		'/admin/reminders',
		'/admin/settings',
		'/admin/access',
		'/admin/system',
		'/api/admin/system',
		'/admin/google',
		'/api/google',
		'/api/google/callback',
		'/api/admin/pin'
	])
		assert.ok(requiresAdmin(route, 'GET'), route);
	for (const method of ['POST', 'PATCH', 'DELETE']) {
		assert.ok(requiresAdmin('/api/reminders', method));
		assert.ok(requiresAdmin('/api/reminders/[id]', method));
	}
	assert.equal(requiresAdmin('/api/reminders/[id]/complete', 'POST'), false);
	assert.equal(requiresAdmin('/api/reminders/[id]/complete', 'PATCH'), true);
	for (const route of ['/', '/api/calendar', '/api/reminders', '/admin/login'])
		assert.equal(requiresAdmin(route, 'GET'), false);
	assert.equal(requiresAdmin('/api/admin/session', 'POST'), false);
});

test('PIN length boundaries retain leading zeroes as part of the credential', async () => {
	const store = new AdminAccess(':memory:');
	try {
		const first = await store.configure(null, '000012');
		assert.ok(await store.login('000012'));
		await assert.rejects(store.login('12'));
		await store.configure('000012', '000000000012', first!);
		assert.ok(await store.login('000000000012'));
		await assert.rejects(store.login('000012'));
	} finally {
		store.close();
	}
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackup, verifyBackup, restoreBackup } from '../scripts/data-tool.mjs';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { GoogleStore } from '../src/lib/server/google-store.ts';
import { AdminAccess } from '../src/lib/server/admin.ts';
import { QrAccess } from '../src/lib/server/qr.ts';

test('online backup restores WAL data, PIN and credentials but revokes copied sessions and QR grants', async () => {
	const root = mkdtempSync(join(tmpdir(), 'calendar-backup-'));
	const source = join(root, 'source'),
		bundle = join(root, 'backup'),
		target = join(root, 'restored');
	mkdirSync(source);
	const reminders = new SqliteReminders(join(source, 'calendar.sqlite'), () => '2026-10-17');
	const google = new GoogleStore(source);
	const admin = new AdminAccess(join(source, 'admin.sqlite'));
	const qr = new QrAccess(reminders.database);
	try {
		reminders.create({
			title: 'Fixture note',
			kind: 'note',
			list: 'General',
			dueDate: '2026-10-18',
			notes: 'Fixture details'
		});
		const todo = reminders.create({
			title: 'Fixture repeating task',
			kind: 'todo',
			list: 'General',
			dueDate: '2026-10-17',
			repeat: { frequency: 'monthly', interval: 6, until: null }
		});
		reminders.complete(todo.id, todo.version, true, '2026-10-17');
		google.set('config', {
			clientId: 'fictional.apps.googleusercontent.com',
			clientSecret: 'fixture-only'
		});
		google.set('accounts', [{ tokens: { refresh_token: 'fixture-refresh' } }]);
		const token = await admin.configure(undefined, '123456');
		qr.configure(true);
		const grant = qr.redeem(qr.issue(null).token);
		const manifest = await createBackup(source, bundle, 'fixture-image');
		assert.equal(manifest.databases['calendar.sqlite'].counts.reminders, 2);
		assert.equal(manifest.databases['calendar.sqlite'].counts.reminder_occurrences, 1);
		assert.equal(readdirSync(bundle).length, 5);
		assert.equal(verifyBackup(bundle).imageReference, 'fixture-image');
		assert.ok(admin.authorized(token!)); // Backup does not revoke the source.
		assert.ok(qr.session(grant.token));
		restoreBackup(bundle, target);
		const restored = new SqliteReminders(join(target, 'calendar.sqlite'));
		const restoredAdmin = new AdminAccess(join(target, 'admin.sqlite'));
		const restoredGoogle = new GoogleStore(target);
		try {
			assert.deepEqual(restored.list(), reminders.list());
			assert.deepEqual(restoredGoogle.get('accounts'), google.get('accounts'));
			assert.ok(restoredAdmin.enabled());
			assert.equal(restoredAdmin.authorized(token!), false);
			assert.ok(await restoredAdmin.login('123456'));
			const restoredQr = new QrAccess(restored.database);
			assert.ok(restoredQr.enabled());
			assert.throws(() => restoredQr.session(grant.token));
		} finally {
			restored.close();
			restoredAdmin.close();
			restoredGoogle.close();
		}
		await assert.rejects(createBackup(source, bundle));
		assert.throws(() => restoreBackup(bundle, target));
		assert.equal(verifyBackup(bundle).format, 1);
		writeFileSync(join(bundle, 'google.key'), Buffer.alloc(32));
		assert.throws(() => verifyBackup(bundle), /checksum/);
		assert.throws(() => restoreBackup(bundle, join(root, 'invalid')), /checksum/);
	} finally {
		reminders.close();
		google.close();
		admin.close();
		rmSync(root, { recursive: true, force: true });
	}
});

test('failed backup removes only its new output, rejects mismatched key and nested destination', async () => {
	const root = mkdtempSync(join(tmpdir(), 'calendar-backup-fail-'));
	const source = join(root, 'source');
	mkdirSync(source);
	const reminders = new SqliteReminders(join(source, 'calendar.sqlite'));
	const google = new GoogleStore(source);
	const admin = new AdminAccess(join(source, 'admin.sqlite'));
	try {
		const original = readFileSync(join(source, 'google.key'));
		writeFileSync(join(source, 'google.key'), Buffer.alloc(32));
		await assert.rejects(createBackup(source, join(root, 'bad')));
		assert.deepEqual(readdirSync(root), ['source']);
		writeFileSync(join(source, 'google.key'), original);
		await assert.rejects(createBackup(source, join(source, 'nested')), /outside/);
		await createBackup(source, join(root, 'good'));
		writeFileSync(join(root, 'good', 'google.sqlite-wal'), 'unexpected');
		assert.throws(() => verifyBackup(join(root, 'good')), /Unexpected/);
	} finally {
		reminders.close();
		google.close();
		admin.close();
		rmSync(root, { recursive: true, force: true });
	}
});

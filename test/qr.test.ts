import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QrAccess } from '../src/lib/server/qr.ts';
import { permittedOrigin } from '../src/lib/server/network.ts';
import { requiresAdmin } from '../src/lib/server/admin.ts';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
test('Reminder date defaults survive redemption and session reuse without restricting saves', () => {
	const db = new DatabaseSync(':memory:');
	const qr = new QrAccess(db);
	qr.configure(true);
	const grant = qr.redeem(qr.issue(null, '2028-02-29').token);
	assert.equal(grant.defaultDate, '2028-02-29');
	const reopened = new QrAccess(db);
	assert.equal(reopened.session(grant.token).defaultDate, '2028-02-29');
	for (const request of ['request-default-0001', 'request-default-0002']) {
		assert.equal(
			reopened.save(grant.token, request, (g) => g.defaultDate),
			'2028-02-29'
		);
	}
	assert.equal(qr.redeem(qr.issue(null).token).defaultDate, null);
	for (const invalid of ['2027-02-29', '2026-13-01', '', 123, '2100-01-01'])
		assert.throws(() => qr.issue(null, invalid), /valid reminder date/);
	assert.throws(() => qr.issue('existing', '2026-10-18'), /valid reminder date/);
	db.close();
});
test('Adding date defaults preserves existing QR settings and grants', () => {
	const db = new DatabaseSync(':memory:');
	db.exec(
		"CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO settings VALUES ('enabled','1'); CREATE TABLE grants (token TEXT PRIMARY KEY, id TEXT, expires INTEGER NOT NULL, stage TEXT NOT NULL);"
	);
	const token = 'a'.repeat(64);
	db.prepare('INSERT INTO grants VALUES (?,?,?,?)').run(
		createHash('sha256').update(token).digest('hex'),
		null,
		Date.now() + 100000,
		'scan'
	);
	const qr = new QrAccess(db);
	assert.equal(qr.enabled(), true);
	assert.equal(qr.redeem(token).defaultDate, null);
	db.close();
});
test('QR grants default off, are single-use, scoped, expire and revoke', () => {
	let now = 1000;
	const qr = new QrAccess(':memory:', () => now);
	assert.throws(() => qr.issue(null));
	qr.configure(true);
	const add = qr.issue(null);
	assert.throws(() => qr.session(add.token));
	now += 300001;
	assert.throws(() => qr.redeem(add.token));
	const grant = qr.redeem(qr.issue('one-reminder').token);
	assert.equal(qr.session(grant.token).id, 'one-reminder');
	const scan = qr.issue(null);
	const session = qr.redeem(scan.token);
	assert.throws(() => qr.redeem(scan.token));
	now += 900001;
	assert.throws(() => qr.session(session.token));
	const fresh = qr.redeem(qr.issue(null).token);
	qr.configure(false);
	assert.throws(() => qr.session(fresh.token));
	qr.configure(true);
	assert.throws(() => qr.session(fresh.token));
	qr.close();
});
test('Add supports multiple saves; retries deduplicate; Edit is consumed only on success', () => {
	const qr = new QrAccess(':memory:');
	qr.configure(true);
	const add = qr.redeem(qr.issue(null).token);
	let writes = 0;
	assert.equal(
		qr.save(add.token, 'request-0000000001', (g) => {
			assert.equal(g.id, null);
			return ++writes;
		}),
		1
	);
	assert.equal(
		qr.save(add.token, 'request-0000000001', () => ++writes),
		1
	);
	assert.equal(
		qr.save(add.token, 'request-0000000002', () => ++writes),
		2
	);
	const edit = qr.redeem(qr.issue('specific').token);
	assert.throws(() =>
		qr.save(edit.token, 'request-0000000003', () => {
			throw new Error('conflict');
		})
	);
	assert.equal(qr.session(edit.token).id, 'specific');
	qr.save(edit.token, 'request-0000000003', (g) => {
		assert.equal(g.id, 'specific');
		return ++writes;
	});
	assert.throws(() => qr.session(edit.token));
	assert.equal(
		qr.save(edit.token, 'request-0000000003', () => ++writes),
		3
	);
	assert.throws(() => qr.save(edit.token, 'request-0000000004', () => ++writes));
	qr.finish(add.token);
	assert.throws(() => qr.session(add.token));
	qr.close();
});
test('Only explicit LAN origins are accepted; admin protection does not inherit QR grants', () => {
	assert.ok(
		permittedOrigin('http://192.168.1.5:8775', '192.168.1.5:8775', 'http://192.168.1.5:8775')
	);
	assert.equal(permittedOrigin('http://evil.test:8775', 'evil.test:8775'), false);
	assert.equal(permittedOrigin('http://127.0.0.1:8775', 'evil.test'), false);
	assert.equal(permittedOrigin('http://192.168.1.5:8775', '192.168.1.5:8775'), false);
	assert.ok(requiresAdmin('/api/admin/qr', 'POST'));
	assert.ok(requiresAdmin('/api/reminders/[id]', 'PATCH'));
	assert.equal(requiresAdmin('/api/qr/reminder', 'POST'), false);
});

import { SqliteReminders } from '../src/lib/server/reminders.ts';
test('QR permission receipts and reminder writes commit or roll back together', () => {
	const repo = new SqliteReminders(':memory:');
	const qr = new QrAccess(repo.database);
	qr.configure(true);
	const session = qr.redeem(qr.issue(null).token);
	const input = { title: 'Fixture', list: 'General', dueDate: null };
	assert.throws(() =>
		qr.save(session.token, 'request-atomic-0001', () => {
			repo.create(input);
			throw new Error('failed');
		})
	);
	assert.equal(repo.list().length, 0);
	const item = qr.save(session.token, 'request-atomic-0001', () => repo.create(input));
	assert.equal(repo.list().length, 1);
	assert.deepEqual(
		qr.save(session.token, 'request-atomic-0001', () => repo.create(input)),
		item
	);
	const edit = qr.redeem(qr.issue(item.id).token);
	assert.throws(() =>
		qr.save(edit.token, 'request-atomic-0002', () => {
			repo.update(item.id, item.version, { ...input, title: 'Changed' });
			throw new Error('failed');
		})
	);
	assert.equal(repo.list()[0].title, 'Fixture');
	qr.save(edit.token, 'request-atomic-0002', () =>
		repo.update(item.id, item.version, { ...input, title: 'Changed' })
	);
	assert.equal(repo.list()[0].title, 'Changed');
	repo.close();
});

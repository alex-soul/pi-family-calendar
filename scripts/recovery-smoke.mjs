// Only use with test/fixtures/recovery-data.ts in a disposable installation.
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:3000';
const request = (path, method = 'GET', body, cookie = '', requestOrigin = origin) =>
	fetch(origin + path, {
		method,
		redirect: 'manual',
		headers: {
			Origin: requestOrigin,
			'Content-Type': 'application/json',
			...(cookie ? { Cookie: cookie } : {})
		},
		...(body ? { body: JSON.stringify(body) } : {})
	});
const reminders = await (await request('/api/reminders')).json();
assert.equal(reminders.length, 2);
assert.ok(
	reminders.every((r) => r.title.startsWith('Fixture ')),
	'Refuse non-fixture data'
);
assert.ok(reminders.some((r) => r.completedDates['2026-10-17']));
assert.equal((await request('/healthz')).status, 200);
assert.equal((await request('/api/google')).status, 401);
assert.equal(
	(
		await request(
			'/api/admin/session',
			'POST',
			{ action: 'unlock', pin: '123456' },
			'',
			'http://evil.invalid'
		)
	).status,
	403
);
const login = await request('/api/admin/session', 'POST', { action: 'unlock', pin: '123456' });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const google = await (await request('/api/google', 'GET', undefined, cookie)).json();
assert.equal(google.accounts.length, 1);
assert.equal(google.accounts[0].label, 'Fixture');
const snapshot = await (await request('/api/calendar?date=2026-10-17')).json();
assert.equal(snapshot.events.length, 1);
assert.equal(snapshot.events[0].title, 'Fixture event');
assert.match(snapshot.sync.message, /paused/);
const connection = await request('/api/google', 'POST', { action: 'connect' }, cookie);
assert.equal(connection.status, 503);
const outside = await (await request('/api/calendar?from=2020-01-01')).json();
assert.equal(outside.events.length, 0);
assert.match(outside.sync.message, /paused/);
const helper = await request('/setup/connect-google.ps1');
assert.equal(helper.status, 200);
assert.match(await helper.text(), /StrictHostKeyChecking=yes/);
await request('/api/admin/session', 'POST', { action: 'lock' }, cookie);
console.log(
	'Recovery HTTP smoke passed: PIN, origins, history, credentials, cache, offline guard and packaged helper.'
);

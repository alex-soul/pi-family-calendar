import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
const origin = process.argv[2] || 'http://127.0.0.1:3000';
if (!process.argv.includes('--disposable'))
	throw new Error('Use only a disposable empty installation.');
let cookie = '';
async function call(path, method = 'GET', body, token, expected = 200, admin = false) {
	const r = await fetch(origin + path, {
		method,
		headers: {
			Origin: origin,
			'Content-Type': 'application/json',
			...(token ? { Authorization: 'Bearer ' + token } : {}),
			...(admin && cookie ? { Cookie: cookie } : {})
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual'
	});
	assert.equal(r.status, expected, `${method} ${path} returned ${r.status}`);
	if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
	return r.status === 204 ? null : r.json();
}
async function scan(action, id) {
	const code = await call('/api/qr/issue', 'POST', { action, id });
	const png = PNG.sync.read(Buffer.from(code.image.split(',')[1], 'base64'));
	const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
	assert.ok(decoded, 'Generated QR is decodable');
	const url = new URL(decoded.data);
	assert.equal(url.pathname, '/reminder');
	assert.equal(url.search, '');
	return url.hash.slice(1);
}
assert.equal((await call('/api/reminders')).length, 0, 'Requires empty reminders');
const google = await call('/api/google');
assert.equal(google.configured, false, 'No Google config');
await call('/api/admin/pin', 'POST', { currentPin: null, newPin: '826491' }, null, 200, true);
await call('/api/admin/qr', 'POST', { enabled: false }, null, 200, true);
await call('/api/qr/issue', 'POST', { action: 'add' }, null, 403);
await call('/api/admin/qr', 'POST', { enabled: true }, null, 401);
await call('/api/admin/qr', 'POST', { enabled: true }, null, 200, true);
const scanToken = await scan('add');
await call('/api/qr/reminder', 'GET', undefined, scanToken, 403);
const add = await call('/api/qr/session', 'POST', { token: scanToken });
await call('/api/qr/session', 'POST', { token: scanToken }, null, 403);
const input = {
	title: 'QR fixture',
	kind: 'todo',
	notes: 'Test only',
	dueDate: null,
	repeat: null,
	list: 'General',
	requestId: 'request-http-000001'
};
const a = await call('/api/qr/reminder', 'POST', input, add.token);
assert.equal((await call('/api/qr/reminder', 'POST', input, add.token)).id, a.id);
const b = await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, title: 'Second', requestId: 'request-http-000002' },
	add.token
);
await call('/api/reminders', 'POST', input, add.token, 401);
await call('/api/admin/qr', 'POST', { enabled: false }, add.token, 401);
const edit = await call('/api/qr/session', 'POST', { token: await scan('edit', a.id) });
await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, id: b.id, version: a.version, requestId: 'request-http-000003' },
	edit.token,
	400
);
await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, version: a.version + 1, requestId: 'request-http-000003' },
	edit.token,
	409
);
const updated = await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, title: 'Updated', version: a.version, requestId: 'request-http-000003' },
	edit.token
);
assert.equal(updated.id, a.id);
await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, requestId: 'request-http-000004' },
	edit.token,
	403
);
await call('/api/qr/session', 'DELETE', undefined, add.token, 204);
await call('/api/qr/reminder', 'GET', undefined, add.token, 403);
const fresh = await call('/api/qr/session', 'POST', { token: await scan('add') });
await call('/api/admin/qr', 'POST', { enabled: false }, null, 200, true);
await call('/api/qr/reminder', 'POST', input, fresh.token, 403);
assert.equal(
	(
		await fetch(origin + '/api/qr/issue', {
			method: 'POST',
			headers: { Origin: 'http://wrong.test', 'Content-Type': 'application/json' },
			body: '{"action":"add"}'
		})
	).status,
	403
);
for (const item of await call('/api/reminders'))
	await call('/api/reminders/' + item.id, 'DELETE', { version: item.version }, null, 204, true);
await call('/api/admin/pin', 'POST', { currentPin: '826491', newPin: null }, null, 200, true);
await call('/api/admin/qr', 'POST', { enabled: true }, null, 200, true);
console.log(
	'QR HTTP smoke passed: decoded QR, PIN separation, scoped editing, retries, conflicts, batch add, Done, revocation and Origin checks.'
);

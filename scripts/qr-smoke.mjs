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
async function scan(action, id, defaultDate) {
	const code = await call('/api/qr/issue', 'POST', { action, id, defaultDate });
	const png = PNG.sync.read(Buffer.from(code.image.split(',')[1], 'base64'));
	const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
	assert.ok(decoded, 'Generated QR is decodable');
	const url = new URL(decoded.data);
	assert.equal(code.link, url.href, 'Direct link uses the exact same scoped QR grant');
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
const scanToken = await scan('add', null, '2028-02-29');
await call('/api/qr/reminder', 'GET', undefined, scanToken, 403);
const add = await call('/api/qr/session', 'POST', { token: scanToken });
await call('/api/qr/session', 'POST', { token: scanToken }, null, 403);
assert.equal(add.defaultDate, '2028-02-29');
assert.equal(
	(await call('/api/qr/reminder', 'GET', undefined, add.token)).defaultDate,
	'2028-02-29'
);
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
assert.equal(a.dueDate, null, 'User can clear the default date');
const b = await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, title: 'Second', requestId: 'request-http-000002' },
	add.token
);
await call('/api/reminders', 'POST', input, add.token, 401);
await call('/api/admin/qr', 'POST', { enabled: false }, add.token, 401);
await call(
	'/api/categories',
	'POST',
	{ name: 'Blocked', color: '#8b6bb1', icon: 'gift' },
	add.token,
	401
);
await call('/api/kiosk-theme', 'GET', undefined, add.token, 403);
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

// Deletion is scoped to the scanned note, consumes that Edit grant and is retry-safe.
const note = await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, kind: 'note', requestId: 'request-note-000001' },
	add.token
);
const noteEdit = await call('/api/qr/session', 'POST', { token: await scan('edit', note.id) });
const deletion = { version: note.version, requestId: 'request-delete-001', confirmed: true };
await call('/api/qr/reminder', 'DELETE', deletion, add.token, 403);
const todoEdit = await call('/api/qr/session', 'POST', { token: await scan('edit', b.id) });
await call('/api/qr/reminder', 'DELETE', { ...deletion, version: b.version }, todoEdit.token, 403);
await call('/api/qr/reminder', 'DELETE', { ...deletion, confirmed: false }, noteEdit.token, 400);
await call('/api/qr/reminder', 'DELETE', { ...deletion, id: b.id }, noteEdit.token, 400);
await call(
	'/api/qr/reminder',
	'DELETE',
	{ ...deletion, version: note.version + 1 },
	noteEdit.token,
	409
);
assert.equal((await call('/api/qr/reminder', 'DELETE', deletion, noteEdit.token)).id, note.id);
assert.equal((await call('/api/qr/reminder', 'DELETE', deletion, noteEdit.token)).id, note.id);
await call(
	'/api/qr/reminder',
	'POST',
	{ ...input, requestId: 'request-after-delete' },
	noteEdit.token,
	403
);
assert.equal(
	(await call('/api/reminders')).some((item) => item.id === note.id),
	false
);
// Preview QR grants target the template, with no implicit generated record.
const template = await call(
	'/api/qr/reminder',
	'POST',
	{
		...input,
		title: 'Timed template',
		dueDate: '2028-01-01',
		dueTime: '08:00',
		repeat: { frequency: 'daily', interval: 1, until: null },
		requestId: 'request-template-001'
	},
	add.token
);
assert.equal(template.dueTime, '08:00');
const beforePreview = (await call('/api/reminders')).length;
await call('/api/calendar?date=2028-01-02');
assert.equal((await call('/api/reminders')).length, beforePreview);
const templateEdit = await call('/api/qr/session', 'POST', {
	token: await scan('edit', template.id)
});
assert.equal(templateEdit.targetType, 'template');
await call(
	'/api/reminders/' + template.id + '/complete',
	'POST',
	{ version: template.version, completed: true },
	null,
	400
);
await call(
	'/api/qr/reminder',
	'DELETE',
	{ ...deletion, version: template.version, requestId: 'request-template-delete' },
	templateEdit.token
);
assert.equal(
	(await call('/api/reminders')).some((r) => r.id === template.id),
	false
);
const category = await call(
	'/api/categories',
	'POST',
	{ name: 'Fixture style', color: '#8b6bb1', icon: 'gift' },
	null,
	200,
	true
);
const styled = await call(
	'/api/qr/reminder',
	'POST',
	{
		...input,
		kind: 'note',
		categoryId: category.id,
		dueDate: '2028-01-01',
		showFrom: '07:00',
		showUntil: '09:00',
		requestId: 'request-styled-note'
	},
	add.token
);
assert.equal(styled.category.name, 'Fixture style');
await call(
	'/api/categories',
	'DELETE',
	{ id: category.id, version: category.version },
	add.token,
	401
);
await call(
	'/api/categories',
	'DELETE',
	{ id: category.id, version: category.version },
	null,
	200,
	true
);
const reassigned = await call('/api/reminders/' + styled.id);
assert.equal(reassigned.categoryId, 'general');
assert.equal(reassigned.title, styled.title);
assert.equal(reassigned.showFrom, '07:00');
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
	'QR HTTP smoke passed: decoded QR, PIN separation, scoped editing/note deletion, retries, conflicts, batch add, Done, revocation and Origin checks.'
);

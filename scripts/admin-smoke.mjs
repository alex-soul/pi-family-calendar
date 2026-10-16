import assert from 'node:assert/strict';
const origin = new URL(process.argv[2]).origin;
if (
	process.argv[3] !== '--disposable' ||
	!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
)
	throw new Error('Use an explicitly disposable local installation.');
const send = (path, method = 'GET', body, cookie = '', requestOrigin = origin) =>
	fetch(origin + path, {
		method,
		redirect: 'manual',
		headers: {
			Origin: requestOrigin,
			'Content-Type': 'application/json',
			...(cookie ? { Cookie: cookie } : {})
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
const cookieOf = (response) => response.headers.get('set-cookie')?.split(';')[0] || '';
for (const [legacy, target] of [
	['/manage', '/admin/reminders'],
	['/manage/google', '/admin/google']
]) {
	const response = await send(legacy);
	assert.equal(response.status, 303);
	assert.equal(response.headers.get('location'), target);
}
const google = await (await send('/api/google')).json();
assert.equal(google.configured, false, 'Never run PIN smoke against configured Google');
assert.deepEqual(await (await send('/api/reminders')).json(), [], 'Use an empty disposable store');
let item = await (
	await send('/api/reminders', 'POST', {
		title: 'PIN boundary fixture',
		list: 'General',
		dueDate: null
	})
).json();
let response = await send('/api/admin/pin', 'POST', { newPin: '123456' });
assert.equal(response.status, 200);
let cookie = cookieOf(response);
assert.ok(cookie);
assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
for (const path of [
	'/admin',
	'/admin/reminders',
	'/admin/google',
	'/admin/settings',
	'/%61dmin/reminders',
	'/api/google/callback?code=fixture&state=fixture'
]) {
	response = await send(path);
	assert.equal(response.status, 303, path);
	assert.ok(response.headers.get('location').startsWith('/admin/login'));
	assert.equal(response.headers.get('location').includes('code='), false);
}
response = await send('/admin/reminders/__data.json');
assert.equal(response.status, 200);
assert.equal((await response.json()).type, 'redirect');
for (const path of ['/api/google', '/api/%67oogle'])
	assert.equal((await send(path)).status, 401, path);
for (const [path, method, body] of [
	['/api/google', 'POST', { action: 'sync' }],
	['/api/admin/pin', 'POST', { newPin: null }],
	['/api/reminders', 'POST', { title: 'Blocked', list: 'General', dueDate: null }],
	[`/api/reminders/${item.id}`, 'PATCH', { ...item, title: 'Blocked' }],
	[`/api/reminders/${item.id}`, 'PATCH', { version: item.version, completed: true }],
	[`/api/reminders/${item.id}`, 'DELETE', { version: item.version }]
])
	assert.equal((await send(path, method, body)).status, 401, path);
response = await send(`/api/reminders/${item.id}/complete`, 'POST', {
	version: item.version,
	completed: true,
	title: 'Smuggled edit'
});
assert.equal(response.status, 400);
response = await send(`/api/reminders/${item.id}/complete`, 'POST', {
	version: item.version,
	completed: true
});
assert.equal(response.status, 200);
item = await response.json();
assert.ok(item.completedAt);
assert.equal(item.title, 'PIN boundary fixture');
assert.equal(
	(
		await send(
			'/api/admin/session',
			'POST',
			{ action: 'unlock', pin: '123456' },
			'',
			'https://unrelated.invalid'
		)
	).status,
	403
);
assert.equal(
	(await send('/api/admin/pin', 'POST', { currentPin: '000000', newPin: null }, cookie)).status,
	401
);
response = await send('/api/admin/session', 'POST', { action: 'unlock', pin: '123456' });
const other = cookieOf(response);
response = await send('/api/admin/pin', 'POST', { currentPin: '123456', newPin: '654321' }, cookie);
assert.equal(response.status, 200);
cookie = cookieOf(response);
assert.equal((await send('/api/google', 'GET', undefined, other)).status, 401);
assert.equal((await send('/api/google', 'GET', undefined, cookie)).status, 200);
response = await send(
	`/api/reminders/${item.id}`,
	'PATCH',
	{ ...item, title: 'Admin edit' },
	cookie
);
assert.equal(response.status, 200);
item = await response.json();
assert.equal(
	(await send(`/api/reminders/${item.id}`, 'DELETE', { version: item.version }, cookie)).status,
	204
);
await send('/api/admin/session', 'POST', { action: 'lock' }, cookie);
assert.equal((await send('/api/google', 'GET', undefined, cookie)).status, 401);
response = await send('/api/admin/session', 'POST', { action: 'unlock', pin: '654321' });
cookie = cookieOf(response);
response = await send('/api/admin/pin', 'POST', { currentPin: '654321', newPin: null }, cookie);
assert.equal(response.status, 200);
assert.equal((await send('/admin')).status, 200);
assert.deepEqual(await (await send('/api/reminders')).json(), []);
console.log(
	'Admin HTTP smoke passed: page/data/encoded-route protection, API protection, completion-only exception, Origin checks, PIN rotation, session revocation and disable.'
);

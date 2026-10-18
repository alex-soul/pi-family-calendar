// Use only the disposable appliance-preview fixture, never a real installation.
import assert from 'node:assert/strict';
const origin = process.argv[2];
if (origin !== 'http://127.0.0.1:5173' || process.argv[3] !== '--simulated')
	throw new Error('Requires the simulated local appliance preview.');
const request = (path, body, cookie = '', source = origin) =>
	fetch(origin + path, {
		method: body ? 'POST' : 'GET',
		headers: { Origin: source, 'Content-Type': 'application/json', Cookie: cookie },
		body: body ? JSON.stringify(body) : undefined,
		redirect: 'manual'
	});
assert.equal((await request('/api/admin/appliance')).status, 401);
assert.equal(
	(await request('/api/admin/appliance', { kind: 'power', action: 'reboot', operation: 'prepare' }))
		.status,
	401
);
assert.equal(
	(
		await request(
			'/api/admin/appliance',
			{ kind: 'display', request: { action: 'sleep' } },
			'calendar-qr=fake'
		)
	).status,
	401
);
const login = await request('/api/admin/session', { action: 'unlock', pin: '123456' });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
assert.equal(
	(
		await request(
			'/api/admin/appliance',
			{ kind: 'power', action: 'reboot', operation: 'prepare' },
			cookie,
			'http://foreign.invalid'
		)
	).status,
	403
);
const state = await (await request('/api/admin/appliance', undefined, cookie)).json();
assert.equal(state.state, 'ready');
assert.equal(state.host.temperatureC, 47.2); // fixture guard before mutations
const settings = { brightness: 80, autoBlank: true, idleMinutes: 15 };
const changed = await request(
	'/api/admin/appliance',
	{ kind: 'display', request: { action: 'settings', settings } },
	cookie
);
assert.equal(changed.status, 200);
assert.equal((await changed.json()).brightness, 80);
assert.equal(
	(
		await request(
			'/api/admin/appliance',
			{
				kind: 'display',
				request: { action: 'settings', settings: { ...settings, brightness: 101 } }
			},
			cookie
		)
	).status,
	400
);
const prepared = await request(
	'/api/admin/appliance',
	{ kind: 'power', action: 'reboot', operation: 'prepare' },
	cookie
);
assert.equal(prepared.status, 200);
const { confirmation } = await prepared.json();
assert.match(confirmation, /^[a-f0-9]{64}$/);
// No confirm here: leave the simulated action available for browser confirmation tests.
console.log(
	'Appliance HTTP smoke passed: PIN, QR exclusion, origin, display bounds and power preparation.'
);

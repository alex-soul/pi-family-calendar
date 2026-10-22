import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KioskTheme } from '../src/lib/server/kiosk-theme.ts';
test('theme reports applied state only, rejects absent kiosk and expires unacknowledged commands', () => {
	let now = 10000;
	const service = new KioskTheme(':memory:', () => now);
	try {
		assert.throws(() => service.command('Warm'));
		const token = service.register();
		let reply = service.exchange(token, { theme: 'dark', revision: -1, ready: true });
		service.exchange(token, { ...reply, ready: true });
		assert.equal(service.status().available, true);
		service.command('Warm');
		assert.equal(service.status().theme, 'dark');
		assert.equal(service.status().available, false);
		reply = service.exchange(token, { ...reply, ready: true });
		assert.equal(reply.theme, 'warm');
		service.exchange(token, { ...reply, ready: true });
		assert.equal(service.status().theme, 'warm');
		assert.equal(service.status().available, true);
		reply = service.exchange(token, { ...reply, theme: 'dark', ready: true });
		assert.equal(service.status().theme, 'dark');
		service.command('Warm');
		now += 5001;
		reply = service.exchange(token, { ...reply, ready: true });
		assert.equal(reply.theme, 'dark');
		now += 9000;
		assert.equal(service.status().available, false);
		assert.throws(() => service.command('Warm'));
		service.register();
		assert.throws(() => service.exchange(token, { ...reply, ready: true }));
	} finally {
		service.close();
	}
});

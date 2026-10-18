// Disposable UI preview. Fake host only: no SSH, shell, hardware or power operations.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AdminAccess } from '../../src/lib/server/admin.ts';
const directory = resolve(process.argv[2]);
mkdirSync(directory, { mode: 0o700 }); // refuses existing data
const admin = new AdminAccess(join(directory, 'admin.sqlite'));
await admin.configure(undefined, '123456');
admin.close();
const token = randomBytes(32).toString('hex');
const tokenFile = join(directory, 'bridge-token');
writeFileSync(tokenFile, token, { mode: 0o600 });
const socketPath =
	process.platform === 'win32'
		? `\\\\.\\pipe\\calendar-preview-${process.pid}`
		: join(directory, 'bridge.sock');
const display = {
	brightness: 70,
	actualBrightness: 70,
	autoBlank: true,
	idleMinutes: 10,
	awake: true,
	wakeMonitor: true,
	sampledAt: Date.now()
};
let pending;
let executed = false;
const server = createServer((socket) => {
	let buffer = '';
	socket.setTimeout(2000, () => socket.destroy());
	socket.on('data', (chunk) => {
		buffer += chunk;
		if (buffer.length > 16384) return socket.destroy();
		if (!buffer.includes('\n')) return;
		try {
			const request = JSON.parse(buffer.split('\n')[0]);
			if (request.token !== token) throw new Error('Access denied.');
			let result;
			if (request.kind === 'status')
				result = {
					display: { ...display, sampledAt: Date.now() },
					powerEnabled: true,
					host: {
						sampledAt: Date.now(),
						uptimeSeconds: 123456,
						memory: {
							total: 2 * 1024 ** 3,
							available: 1.2 * 1024 ** 3,
							swapTotal: 1024 ** 3,
							swapUsed: 0
						},
						disk: { total: 128 * 1024 ** 3, free: 102 * 1024 ** 3 },
						temperatureC: 47.2,
						throttleFlags: 0,
						failedUnits: 0,
						maintenance: {
							sampledAt: Date.now(),
							status: 'ok',
							lastSuccess: Date.now() - 86400000,
							nextUpdate: Date.now() + 86400000,
							nextReboot: Date.now() + 90000000,
							pendingReboot: false,
							bootHealth: 'ok'
						},
						backup: { sampledAt: Date.now(), status: 'ok', lastSuccess: Date.now() - 86400000 },
						mqtt: { sampledAt: Date.now(), connected: true }
					}
				};
			else if (request.kind === 'display') {
				if (request.request.action === 'settings')
					Object.assign(display, request.request.settings, {
						actualBrightness: request.request.settings.brightness
					});
				else display.awake = request.request.action === 'wake';
				result = display;
			} else if (request.kind === 'power') {
				if (executed)
					throw new Error(
						'A power action was recently requested. Check the device before retrying.'
					);
				if (request.request.operation === 'prepare') {
					pending = {
						...request.request,
						confirmation: randomBytes(32).toString('hex'),
						expiresAt: Date.now() + 30000
					};
					result = { confirmation: pending.confirmation, expiresAt: pending.expiresAt };
				} else {
					if (
						!pending ||
						pending.expiresAt <= Date.now() ||
						pending.owner !== request.request.owner ||
						pending.action !== request.request.action ||
						pending.confirmation !== request.request.confirmation
					)
						throw new Error('Invalid confirmation.');
					pending = null;
					executed = true;
					result = { accepted: true };
				}
			} else throw new Error('Unknown request.');
			socket.end(JSON.stringify({ ok: true, data: result }) + '\n');
		} catch (cause) {
			socket.end(JSON.stringify({ ok: false, message: cause.message }) + '\n');
		}
	});
});
await new Promise((resolve) => server.listen(socketPath, resolve));
const child = spawn(
	process.execPath,
	['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
	{
		stdio: 'inherit',
		env: {
			...process.env,
			DATA_DIR: directory,
			GOOGLE_SYNC_ENABLED: 'false',
			CALENDAR_SOURCE: 'demo',
			PUBLIC_BASE_URL: 'http://127.0.0.1:5173',
			LAN_ORIGIN: '',
			APP_TIME_ZONE: 'Europe/London',
			APPLIANCE_SOCKET: socketPath,
			APPLIANCE_TOKEN_FILE: tokenFile
		}
	}
);
child.on('exit', (code) => {
	server.close();
	process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, () => {
		child.kill();
		server.close();
	});
console.log(
	'Disposable appliance preview: http://127.0.0.1:5173/admin — fixture PIN 123456. All device actions are simulated.'
);

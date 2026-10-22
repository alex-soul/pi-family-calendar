// Fictional screenshot DEV. Every launch creates a new isolated directory.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { seedDev } from './dev-fixtures.mjs';

const directory = process.env.DEV_DATA_DIR || mkdtempSync(join(tmpdir(), 'calendar-screenshots-'));
seedDev(directory);
const child = spawn(
	process.execPath,
	['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
	{
		cwd: resolve(import.meta.dirname, '..'),
		stdio: 'inherit',
		env: {
			...process.env,
			DATA_DIR: directory,
			KIOSK_THEME_TOKEN_FILE: join(directory, 'dev-theme-token'),
			CALENDAR_SOURCE: 'demo',
			GOOGLE_SYNC_ENABLED: 'false',
			APP_TIME_ZONE: 'Europe/London',
			PUBLIC_BASE_URL: 'http://127.0.0.1:5174',
			LAN_ORIGIN: 'http://127.0.0.1:5174',
			APPLIANCE_SOCKET: '',
			APPLIANCE_TOKEN_FILE: ''
		}
	}
);
child.on('exit', (code) => {
	process.exitCode = code || 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
console.log(
	`Screenshot DEV: http://127.0.0.1:5174 — fictional reminders, current-date events. Data: ${directory}`
);

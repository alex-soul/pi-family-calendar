// Fictional screenshot DEV. Every launch creates a new isolated directory.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { dateKey, addDays } from '../src/lib/dates.ts';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { QrAccess } from '../src/lib/server/qr.ts';

const directory = mkdtempSync(join(tmpdir(), 'calendar-screenshots-'));
const today = dateKey(new Date(), 'Europe/London');
let fixtureDay = addDays(today, -1);
const reminders = new SqliteReminders(join(directory, 'calendar.sqlite'), () => fixtureDay);
const add = (title, offset, kind = 'todo', notes = '', repeat = null, times = {}) =>
	reminders.create({
		title,
		dueDate: offset === null ? null : addDays(today, offset),
		kind,
		list: 'General',
		notes,
		repeat,
		...times
	});
// Simulate one midnight slot in this isolated fictional dataset only.
add(
	'Lunchboxes ready',
	-1,
	'note',
	'Water bottles and packed lunches.',
	{ frequency: 'daily', interval: 1, until: null },
	{ showFrom: '07:00', showUntil: '09:00' }
);
add(
	'Feed the cat - morning',
	-1,
	'todo',
	'',
	{ frequency: 'daily', interval: 1, until: null },
	{ dueTime: '08:00' }
);
add(
	'Feed the cat - evening',
	-1,
	'todo',
	'',
	{ frequency: 'daily', interval: 1, until: null },
	{ dueTime: '20:00' }
);
fixtureDay = today;
reminders.generate(today, '00:00');
add('Evening plans', 0, 'note', 'A timed Note for the afternoon and evening.', null, {
	showFrom: '12:00',
	showUntil: '23:00'
});
add('Yesterday morning note', -1, 'note', 'Past notes keep their display window.', null, {
	showFrom: '07:00',
	showUntil: '09:00'
});
add('Return library books', -2, 'todo', 'The book bag is beside the front door.');
add('Pack swimming bags', 0, 'todo', 'Goggles, towels and a snack for afterwards.');
add('Plan meals for the week', 0, 'todo', 'Check the freezer before writing the shopping list.');
add('Lunch at one', 0, 'note', 'Grandparents are bringing dessert.');
add('Book the car service', null, 'todo');
add('Ideas for half-term', null, 'note', 'Beach walk · museum · a cosy film afternoon');
add('PE kits ready', 1, 'todo', 'Trainers and water bottles.', {
	frequency: 'weekly',
	interval: 1,
	until: null
});
add('Recycling out', 2, 'todo', 'Paper, cardboard and clean containers.', {
	frequency: 'weekly',
	interval: 2,
	until: null
});
add('School photo day', 3, 'note', 'Remember the school jumper.');
add('Water the houseplants', 4, 'todo', '', { frequency: 'weekly', interval: 1, until: null });
add('Pack for the coast', 5, 'todo', 'Wellies, waterproofs and the board games.');
add('Pick up birthday candles', 6);
add('Renew library membership', 10);
add('Check smoke alarms', 14, 'todo', '', { frequency: 'monthly', interval: 1, until: null });
add('Book a family cinema trip', 18);
add('Half-term picnic ideas', 8, 'note', 'Soup in a flask and warm blankets.');
for (const [title, offset] of [
	['Order the birthday cake', -3],
	['Pay for the school trip', -1],
	['Put the washing on', 0]
]) {
	const item = add(title, offset);
	reminders.complete(item.id, item.version, true);
}
new QrAccess(reminders.database).configure(true);
const count = reminders.list().length;
reminders.close();
writeFileSync(
	join(directory, 'SCREENSHOT-DATA.txt'),
	'Fictional data only. No Google account or household data.\n'
);
const child = spawn(
	process.execPath,
	['node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
	{
		cwd: resolve(import.meta.dirname, '..'),
		stdio: 'inherit',
		env: {
			...process.env,
			DATA_DIR: directory,
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
	`Screenshot DEV: http://127.0.0.1:5174 — ${count} fictional reminders, current-date events. Data: ${directory}`
);

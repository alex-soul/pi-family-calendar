import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { dateKey, addDays } from '../src/lib/dates.ts';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { QrAccess } from '../src/lib/server/qr.ts';
export function seedDev(directory) {
	mkdirSync(directory, { recursive: true });
	const token = join(directory, 'dev-theme-token');
	if (!existsSync(token)) writeFileSync(token, randomBytes(32).toString('hex'), { mode: 0o600 });
	const today = dateKey(new Date(), 'Europe/London');
	let fixtureDay = addDays(today, -1);
	const reminders = new SqliteReminders(join(directory, 'calendar.sqlite'), () => fixtureDay, {
		resetLegacy: process.env.RESET_REMINDERS === 'true'
	});
	reminders.database.exec('CREATE TABLE IF NOT EXISTS dev_fixture_seed (seeded INTEGER NOT NULL)');
	if (
		reminders.database.prepare('SELECT seeded FROM dev_fixture_seed').get() ||
		reminders.list().length
	) {
		reminders.close();
		return;
	}
	reminders.database.exec('BEGIN IMMEDIATE');
	const birthday = reminders.saveCategory({ name: 'Birthdays', color: '#8b6bb1', icon: 'gift' });
	const school = reminders.saveCategory({ name: 'School', color: '#4f8b81', icon: 'calendar' });
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
		{ showFrom: '07:00', showUntil: '09:00', categoryId: school.id }
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
	add('Jamie birthday', 0, 'note', 'A birthday Note with a custom category.', null, {
		categoryId: birthday.id
	});
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
	reminders.database.exec('INSERT INTO dev_fixture_seed VALUES(1); COMMIT;');

	reminders.close();
	writeFileSync(
		join(directory, 'SCREENSHOT-DATA.txt'),
		'Fictional data only. No Google account or household data.\n'
	);
}

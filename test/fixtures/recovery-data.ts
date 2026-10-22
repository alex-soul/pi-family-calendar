// Fictional deployment/recovery fixture. Refuses an existing destination.
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { GoogleStore } from '../../src/lib/server/google-store.ts';
import { SqliteReminders } from '../../src/lib/server/reminders.ts';
import { AdminAccess } from '../../src/lib/server/admin.ts';
import { QrAccess } from '../../src/lib/server/qr.ts';
const path = resolve(process.argv[2]);
mkdirSync(path, { mode: 0o700 });
let fixtureDay = '2026-10-16';
const reminders = new SqliteReminders(join(path, 'calendar.sqlite'), () => fixtureDay);
const google = new GoogleStore(path);
const admin = new AdminAccess(join(path, 'admin.sqlite'));
try {
	reminders.create({
		title: 'Fixture note',
		kind: 'note',
		list: 'General',
		dueDate: null,
		notes: 'Recovery fixture only'
	});
	const todo = reminders.create({
		title: 'Fixture recurring task',
		kind: 'todo',
		list: 'General',
		dueDate: '2026-10-17',
		repeat: { frequency: 'monthly', interval: 6, until: null }
	});
	fixtureDay = '2026-10-17';
	reminders.generate(fixtureDay, '00:00');
	const generated = reminders.list().find((r) => r.sourceTemplateId === todo.id)!;
	reminders.complete(generated.id, generated.version, true);
	await admin.configure(undefined, '123456');
	const qr = new QrAccess(reminders.database);
	qr.configure(true);
	qr.redeem(qr.issue(null).token);
	const calendar = {
		id: 'fictional@example.invalid',
		summary: 'Fixture calendar',
		accessRole: 'owner',
		primary: true
	};
	google.set('config', {
		clientId: 'fictional.apps.googleusercontent.com',
		clientSecret: 'fixture-only'
	});
	google.set('accounts', [
		{
			id: 'fixture',
			label: 'Fixture',
			calendars: [calendar],
			selected: [calendar.id],
			tokens: { refresh_token: 'fixture-only' }
		}
	]);
	const range = { from: '2026-10-01', to: '2026-11-01' };
	google.mirror.replaceRange(calendar.id, range, [
		{
			id: 'fixture-event',
			summary: 'Fixture event',
			start: { date: '2026-10-17' },
			end: { date: '2026-10-18' }
		}
	]);
	const state = google.mirror.state(calendar.id);
	state.ranges = [range];
	state.lastSuccess = '2026-10-17T12:00:00Z';
	google.mirror.saveState(calendar.id, state);
} finally {
	reminders.close();
	google.close();
	admin.close();
}
console.log('Fictional recovery fixture created.');

import { QrAccess } from './qr.ts';
import { AdminAccess } from './admin.ts';
import { GoogleCalendars } from './google.ts';
import { GoogleStore } from './google-store.ts';
import { resolve } from 'node:path';
import { dateKey } from '../dates.ts';
import { DemoCalendarProvider, UnconnectedCalendarProvider } from './calendar.ts';
import { SqliteReminders } from './reminders.ts';
import { startReminderScheduler } from './reminder-scheduler.ts';

export const timeZone = process.env.APP_TIME_ZONE || 'UTC';
// Fail visibly for an invalid configured zone, rather than silently showing the wrong day.
new Intl.DateTimeFormat('en-GB', { timeZone }).format();
let google: GoogleCalendars | undefined;
export function googleCalendars() {
	return (google ??= new GoogleCalendars(
		new GoogleStore(resolve(process.env.DATA_DIR || 'data')),
		undefined,
		process.env.GOOGLE_SYNC_ENABLED === 'false'
	));
}
const fallback =
	process.env.CALENDAR_SOURCE === 'demo'
		? new DemoCalendarProvider()
		: new UnconnectedCalendarProvider();
export const calendarProvider = {
	snapshot(from: string, to: string, zone: string) {
		const google = googleCalendars();
		return google.configured()
			? google.snapshot(from, to, zone)
			: fallback.snapshot(from, to, zone);
	}
};

let reminders: SqliteReminders | undefined;
export function reminderRepository(): SqliteReminders {
	return (reminders ??= new SqliteReminders(
		resolve(process.env.DATA_DIR || 'data', 'calendar.sqlite'),
		() => dateKey(new Date(), timeZone),
		{ resetLegacy: process.env.RESET_REMINDERS === 'true' }
	));
}

let admin: AdminAccess | undefined;
export function adminAccess() {
	return (admin ??= new AdminAccess(resolve(process.env.DATA_DIR || 'data', 'admin.sqlite')));
}

let qr: QrAccess | undefined;
let stopReminders: (() => void) | undefined;
export function startReminders() {
	stopReminders ??= startReminderScheduler(reminderRepository(), timeZone);
}
export function qrAccess() {
	return (qr ??= new QrAccess(reminderRepository().database));
}

export function quiesceServices() {
	stopReminders?.();
	google?.stop();
}
export async function shutdownServices() {
	stopReminders?.();
	await google?.shutdown();
	// QR shares the reminder connection; close that connection only once.
	reminders?.close();
	admin?.close();
}

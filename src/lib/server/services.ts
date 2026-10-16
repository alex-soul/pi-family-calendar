import { GoogleCalendars } from './google.ts';
import { GoogleStore } from './google-store.ts';
import { resolve } from 'node:path';
import { DemoCalendarProvider, UnconnectedCalendarProvider } from './calendar.ts';
import { SqliteReminders } from './reminders.ts';

export const timeZone = process.env.APP_TIME_ZONE || 'UTC';
// Fail visibly for an invalid configured zone, rather than silently showing the wrong day.
new Intl.DateTimeFormat('en-GB', { timeZone }).format();
let google: GoogleCalendars | undefined;
export function googleCalendars() {
	return (google ??= new GoogleCalendars(new GoogleStore(resolve(process.env.DATA_DIR || 'data'))));
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
		resolve(process.env.DATA_DIR || 'data', 'calendar.sqlite')
	));
}

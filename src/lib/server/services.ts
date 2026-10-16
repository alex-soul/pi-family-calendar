import { resolve } from 'node:path';
import { DemoCalendarProvider, UnconnectedCalendarProvider } from './calendar.ts';
import { SqliteReminders } from './reminders.ts';

export const timeZone = process.env.APP_TIME_ZONE || 'UTC';
// Fail visibly for an invalid configured zone, rather than silently showing the wrong day.
new Intl.DateTimeFormat('en-GB', { timeZone }).format();
export const calendarProvider =
	process.env.CALENDAR_SOURCE === 'demo'
		? new DemoCalendarProvider()
		: new UnconnectedCalendarProvider();

let reminders: SqliteReminders | undefined;
export function reminderRepository(): SqliteReminders {
	return (reminders ??= new SqliteReminders(
		resolve(process.env.DATA_DIR || 'data', 'calendar.sqlite')
	));
}

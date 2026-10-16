import { googleCalendars, reminderRepository, timeZone } from '#lib/server/services.ts';
export function load() {
	const google = googleCalendars().status();
	const reminders = reminderRepository().list();
	return {
		timeZone,
		reminderCount: reminders.length,
		accountCount: google.accounts.length,
		calendarCount: new Set(
			google.accounts.flatMap((a) => a.calendars.filter((c) => c.selected).map((c) => c.googleId))
		).size,
		googleConfigured: google.configured
	};
}

import { addDays, dateKey, monthGrid } from '#lib/dates.ts';
import { calendarProvider, reminderRepository, timeZone } from '#lib/server/services.ts';
export async function load() {
	const now = new Date();
	const today = dateKey(now, timeZone);
	const grid = monthGrid(today);
	return {
		now: now.toISOString(),
		today,
		snapshot: await calendarProvider.snapshot(grid[0], addDays(grid[41], 8), timeZone),
		reminders: reminderRepository().list()
	};
}

import { kioskTheme, themeEnabled } from '#lib/server/kiosk-theme.ts';
import { addDays, dateKey, monthGrid } from '#lib/dates.ts';
import {
	calendarProvider,
	reminderRepository,
	timeZone,
	qrAccess,
	googleCalendars
} from '#lib/server/services.ts';
export async function load({ url }) {
	const now = new Date();
	const today = dateKey(now, timeZone);
	const grid = monthGrid(today);
	return {
		kioskThemeToken:
			themeEnabled() &&
			url.searchParams.get('kiosk') === '1' &&
			['localhost', '127.0.0.1'].includes(url.hostname)
				? kioskTheme().register()
				: null,
		qrEnabled: qrAccess().enabled(),
		eventQrEnabled: googleCalendars().eventQrSettings().available,
		now: now.toISOString(),
		today,
		snapshot: await calendarProvider.snapshot(grid[0], addDays(grid[41], 8), timeZone),
		reminders: reminderRepository().query(grid[0], addDays(grid[41], 8))
	};
}

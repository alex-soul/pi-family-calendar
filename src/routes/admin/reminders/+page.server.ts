import { dateKey } from '#lib/dates.ts';
import { reminderRepository, timeZone } from '#lib/server/services.ts';
export function load() {
	return {
		reminders: reminderRepository().page(),
		categories: reminderRepository().categories(),
		today: dateKey(new Date(), timeZone),
		timeZone
	};
}

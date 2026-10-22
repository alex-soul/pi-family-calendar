import type { Calendar, CalendarEvent } from './domain.ts';
import { eventDates } from './month.ts';
export const hiddenEventKey = (event: CalendarEvent, date: string) =>
	JSON.stringify([event.calendarId, event.id, date]);
export function hiddenOnDate(
	events: CalendarEvent[],
	date: string,
	zone: string,
	keys: string[]
): CalendarEvent[] {
	const set = new Set(keys);
	return events.filter((e) => {
		const range = eventDates(e, zone);
		return range.first <= date && range.last >= date && set.has(hiddenEventKey(e, date));
	});
}
export function parseHiddenEvents(value: string | null): string[] {
	try {
		const v = JSON.parse(value || '[]');
		return Array.isArray(v)
			? v
					.filter((x) => {
						if (typeof x !== 'string' || x.length > 1500) return false;
						try {
							const a = JSON.parse(x);
							return (
								Array.isArray(a) &&
								a.length === 3 &&
								a.every((v) => typeof v === 'string') &&
								/^\d{4}-\d{2}-\d{2}$/.test(a[2])
							);
						} catch {
							return false;
						}
					})
					.slice(-10000)
			: [];
	} catch {
		return [];
	}
}
export interface EventVisibility {
	calendar: (e: CalendarEvent) => Calendar | undefined;
	timeZone: () => string;
	hidden: (e: CalendarEvent, date: string) => boolean;
	forDate: (events: CalendarEvent[], date: string) => CalendarEvent[];
	open: (e: CalendarEvent, date: string) => void;
}

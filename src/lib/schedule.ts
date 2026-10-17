import { remindersForDay, orderReminders, type ScheduleRow } from './display.ts';
import type { CalendarEvent, CalendarSnapshot, Reminder } from './domain.ts';
import { addDays, indexEvents, isDateKey } from './dates.ts';
import { plainDescription } from './description.ts';

/** A forward-only page; its end is exclusive, just like provider snapshots. */
export function scheduleRange(from: string): { from: string; to: string } {
	if (!isDateKey(from) || from < '1900-01-01' || from > '2099-12-31')
		throw new Error('Choose a date between 1900 and 2099.');
	return { from, to: [addDays(from, 42), '2100-01-01'].sort()[0] };
}

/** Each window owns its days. Replacing a window also removes cancelled instances. */
export function scheduleRows(pages: CalendarSnapshot[], hiddenCalendars: string[] = []) {
	const dates = new Map<string, CalendarEvent[]>();
	for (const page of pages) {
		const events = [...new Map(page.events.map((event) => [event.id, event])).values()]
			.filter((event) => !hiddenCalendars.includes(event.calendarId))
			.map((event) => ({ ...event, description: plainDescription(event.description) }));
		const index = indexEvents(events, page.from, page.to, page.timeZone);
		for (let date = page.from; date < page.to; date = addDays(date, 1))
			dates.set(date, index.get(date) || []);
	}
	return [...dates]
		.sort(([a], [b]) => a.localeCompare(b))
		.flatMap(([date, events]) => events.map((event) => ({ date, event })));
}

/** Calendar history includes every dated reminder, independent of event visibility. */
export function combinedScheduleRows(
	pages: CalendarSnapshot[],
	hidden: string[],
	reminders: Reminder[]
): ScheduleRow[] {
	const events = scheduleRows(pages, hidden);
	const days = new Map<string, ScheduleRow[]>();
	for (const page of pages)
		for (let date = page.from; date < page.to; date = addDays(date, 1)) days.set(date, []);
	for (const row of events) days.get(row.date)!.push(row);
	return [...days]
		.sort(([a], [b]) => a.localeCompare(b))
		.flatMap(([date, rows]) => [
			...rows,
			...orderReminders(remindersForDay(reminders, date).items).map((reminder) => ({
				date,
				reminder
			}))
		]);
}

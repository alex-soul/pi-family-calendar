import type { CalendarEvent } from './domain.ts';
import { addDays, dateKey, timeLabel } from './dates.ts';

/** Inclusive dates occupied by an event; midnight ends never add an extra day. */
export function eventDates(event: CalendarEvent, zone: string) {
	return event.kind === 'all-day'
		? { first: event.startDate, last: addDays(event.endDate, -1) }
		: {
				first: dateKey(event.start, zone),
				last: dateKey(new Date(Date.parse(event.end) - 1), zone)
			};
}
export function dayTime(event: CalendarEvent, date: string, zone: string) {
	if (event.kind === 'all-day') return { primary: 'All day', secondary: '', summary: 'All day' };
	const { first, last } = eventDates(event, zone);
	const end = dateKey(event.end, zone) > date ? '24:00' : timeLabel(event.end, zone);
	if (first < date && last > date)
		return { primary: 'All day', secondary: 'Continues', summary: 'All day · continues' };
	if (first < date) return { primary: 'Until', secondary: end, summary: `Until ${end}` };
	const start = timeLabel(event.start, zone);
	if (last > date) return { primary: start, secondary: 'Continues', summary: `${start} →` };
	return { primary: start, secondary: end, summary: `${start} – ${end}` };
}
export interface MonthSegment {
	event: CalendarEvent;
	start: number;
	end: number;
	lane: number;
	continuesBefore: boolean;
	continuesAfter: boolean;
}
/** Pack whole event spans into non-overlapping weekly lanes, before single-day entries. */
export function monthWeek(
	events: CalendarEvent[],
	dates: string[],
	zone: string,
	hidden: (event: CalendarEvent, date: string) => boolean = () => false
): MonthSegment[] {
	const first = dates[0],
		last = dates[dates.length - 1];
	const candidates = events
		.map((event) => ({ event, ...eventDates(event, zone) }))
		.filter((item) => item.first <= last && item.last >= first)
		.sort(
			(a, b) =>
				Number(b.last > b.first) - Number(a.last > a.first) ||
				Number(b.event.kind === 'all-day') - Number(a.event.kind === 'all-day') ||
				a.first.localeCompare(b.first) ||
				b.last.localeCompare(a.last) ||
				(a.event.kind === 'timed' && b.event.kind === 'timed'
					? Date.parse(a.event.start) - Date.parse(b.event.start)
					: 0) ||
				a.event.id.localeCompare(b.event.id)
		);
	const occupied: boolean[][] = [];
	return candidates.flatMap((item) => {
		const parts: MonthSegment[] = [];
		let col = 0;
		while (col < dates.length) {
			if (dates[col] < item.first || dates[col] > item.last || hidden(item.event, dates[col])) {
				col++;
				continue;
			}
			const start = col;
			while (
				col + 1 < dates.length &&
				dates[col + 1] <= item.last &&
				!hidden(item.event, dates[col + 1])
			)
				col++;
			const end = col++;
			let lane = 0;
			while (occupied[lane]?.slice(start, end + 1).some(Boolean)) lane++;
			occupied[lane] ||= Array(dates.length).fill(false);
			for (let i = start; i <= end; i++) occupied[lane][i] = true;
			parts.push({
				event: item.event,
				start,
				end,
				lane,
				continuesBefore: item.first < dates[start],
				continuesAfter: item.last > dates[end]
			});
		}
		return parts;
	});
}

/** Presentation grouping only: timed multi-day events retain their original timestamps. */
export function isBannerEvent(event: CalendarEvent, zone: string): boolean {
	const { first, last } = eventDates(event, zone);
	return event.kind === 'all-day' || first !== last;
}
export function eventDayNumber(event: CalendarEvent, date: string, zone: string) {
	const { first, last } = eventDates(event, zone);
	const days = (a: string, b: string) =>
		Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
	return { day: days(date, first) + 1, total: days(last, first) + 1 };
}
export function scheduleTime(event: CalendarEvent, date: string, zone: string): string {
	const progress = eventDayNumber(event, date, zone);
	if (event.kind === 'all-day') return 'All day';
	if (progress.total === 1) return dayTime(event, date, zone).summary;
	if (progress.day === 1) return timeLabel(event.start, zone);
	if (progress.day < progress.total) return 'All day';
	return dayTime(event, date, zone).summary;
}
export function bannerTime(event: CalendarEvent, date: string, zone: string): string {
	if (event.kind === 'all-day') return '';
	const { day, total } = eventDayNumber(event, date, zone);
	return day === 1
		? timeLabel(event.start, zone)
		: day === total
			? dayTime(event, date, zone).summary
			: '';
}

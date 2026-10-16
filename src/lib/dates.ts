import type { CalendarEvent } from './domain.ts';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}:${JSON.stringify(options)}`;
	let value = formatters.get(key);
	if (!value) {
		value = new Intl.DateTimeFormat(locale, options);
		formatters.set(key, value);
	}
	return value;
}

export function isDateKey(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T12:00:00Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateKey(instant: Date | string, timeZone: string): string {
	const parts = formatter('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(instant));
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(date: string, amount: number): string {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + amount);
	return value.toISOString().slice(0, 10);
}

export function startOfWeek(date: string): string {
	const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
	return addDays(date, -((weekday + 6) % 7));
}

export function monthGrid(date: string): string[] {
	const first = startOfWeek(`${date.slice(0, 7)}-01`);
	return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
	return formatter('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export function timeLabel(instant: string, timeZone: string): string {
	return formatter('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
		new Date(instant)
	);
}

export function occursOn(event: CalendarEvent, date: string, timeZone: string): boolean {
	if (event.kind === 'all-day') return event.startDate <= date && event.endDate > date;
	// Subtract one millisecond so an event ending at midnight does not spill into the next day.
	return (
		dateKey(event.start, timeZone) <= date &&
		dateKey(new Date(new Date(event.end).getTime() - 1), timeZone) >= date
	);
}

export function eventsOn(events: CalendarEvent[], date: string, timeZone: string): CalendarEvent[] {
	return events.filter((event) => occursOn(event, date, timeZone)).sort(compareEvents);
}

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
	if (a.kind !== b.kind) return a.kind === 'all-day' ? -1 : 1;
	if (a.kind === 'timed' && b.kind === 'timed')
		return Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title);
	return (
		(a.kind === 'timed' ? a.start : a.startDate).localeCompare(
			b.kind === 'timed' ? b.start : b.startDate
		) || a.title.localeCompare(b.title)
	);
}

/** Build the visible date index once, not repeatedly for every month dot and calendar. */
export function indexEvents(
	events: CalendarEvent[],
	from: string,
	to: string,
	timeZone: string
): Map<string, CalendarEvent[]> {
	const index = new Map<string, CalendarEvent[]>();
	for (const event of events) {
		let start = event.kind === 'all-day' ? event.startDate : dateKey(event.start, timeZone);
		const last =
			event.kind === 'all-day'
				? addDays(event.endDate, -1)
				: dateKey(new Date(Date.parse(event.end) - 1), timeZone);
		if (start < from) start = from;
		for (let date = start; date <= last && date < to; date = addDays(date, 1)) {
			const day = index.get(date) || [];
			day.push(event);
			index.set(date, day);
		}
	}
	for (const day of index.values()) day.sort(compareEvents);
	return index;
}

export function isPast(event: CalendarEvent, date: string, now: Date, timeZone: string): boolean {
	return date === dateKey(now, timeZone) && event.kind === 'timed' && new Date(event.end) <= now;
}

export function isOngoing(event: CalendarEvent, now: Date): boolean {
	return event.kind === 'timed' && new Date(event.start) <= now && new Date(event.end) > now;
}

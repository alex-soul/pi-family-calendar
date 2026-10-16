import type { CalendarEvent, Reminder } from './domain.ts';

/** Past events stay in the list; this index is only the idle scroll destination. */
export function agendaFocusIndex(events: CalendarEvent[], now: Date): number {
	const index = events.findIndex((e) => e.kind === 'timed' && Date.parse(e.end) > now.getTime());
	return index < 0 ? events.length : index;
}

export function remindersForDay(reminders: Reminder[], date: string) {
	const items = reminders.filter((r) => r.dueDate === date);
	return { items, completed: items.filter((r) => r.completedAt).length, total: items.length };
}

export type ScheduleRow = { date: string; event: CalendarEvent };
export function scheduleFocusIndex(rows: ScheduleRow[], today: string, now: Date): number {
	const current = rows.findIndex(
		(r) => r.date === today && r.event.kind === 'timed' && Date.parse(r.event.end) > now.getTime()
	);
	if (current >= 0) return current;
	const next = rows.findIndex((r) => r.date > today);
	if (next >= 0) return next;
	const allDay = rows.findIndex((r) => r.date === today && r.event.kind === 'all-day');
	return allDay >= 0 ? allDay : rows.length;
}

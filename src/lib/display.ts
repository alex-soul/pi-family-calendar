import type { CalendarEvent, Reminder } from './domain.ts';
import { occursOn, occurrence, oldestOutstanding } from './recurrence.ts';

/** Past events stay in the list; this index is only the idle scroll destination. */
export function agendaFocusIndex(events: CalendarEvent[], now: Date): number {
	const index = events.findIndex((e) => e.kind === 'timed' && Date.parse(e.end) > now.getTime());
	return index < 0 ? events.length : index;
}

export function remindersForDay(reminders: Reminder[], date: string) {
	const items = reminders
		.filter((r) => (r.repeat ? occursOn(r, date) : r.dueDate === date))
		.map((r) => (r.repeat ? occurrence(r, date) : r));
	const todos = items.filter((r) => r.kind !== 'note');
	return { items, completed: todos.filter((r) => r.completedAt).length, total: todos.length };
}

export type ScheduleRow = { date: string; event?: CalendarEvent; reminder?: Reminder };
export function scheduleFocusIndex(rows: ScheduleRow[], today: string, now: Date): number {
	const current = rows.findIndex(
		(r) => r.date === today && r.event?.kind === 'timed' && Date.parse(r.event!.end) > now.getTime()
	);
	if (current >= 0) return current;
	const reminder = rows.findIndex((r) => r.date === today && r.reminder);
	if (reminder >= 0) return reminder;
	const next = rows.findIndex((r) => r.date > today);
	if (next >= 0) return next;
	const allDay = rows.findIndex((r) => r.date === today && r.event?.kind === 'all-day');
	return allDay >= 0 ? allDay : rows.length;
}

/** Notes lead each date's reminders; preserve ordering within each kind. */
export function orderReminders(items: Reminder[]): Reminder[] {
	return [...items.filter((r) => r.kind === 'note'), ...items.filter((r) => r.kind !== 'note')];
}

export function overdueReminders(reminders: Reminder[], today: string): Reminder[] {
	return reminders
		.map((r) => oldestOutstanding(r, today))
		.filter((r): r is Reminder => !!r && r.dueDate! < today)
		.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.title.localeCompare(b.title));
}

/** Only today's widget includes overdue and undated work. */
export function reminderWidgetGroups(reminders: Reminder[], today: string, selectedDate: string) {
	if (selectedDate !== today) {
		return {
			selected: remindersForDay(reminders, selectedDate).items.filter(
				(r) => selectedDate < today || (!r.completedAt && !r.clearedAt)
			),
			overdue: [],
			today: [],
			anytime: []
		};
	}
	const overdue = overdueReminders(reminders, today);
	const overdueIds = new Set(overdue.map((r) => r.id));
	const activeOn = (date: string) =>
		remindersForDay(reminders, date).items.filter(
			(r) => !r.completedAt && !r.clearedAt && !(date <= today && overdueIds.has(r.id))
		);
	return {
		selected: [],
		overdue,
		today: activeOn(today),
		anytime: reminders.filter((r) => !r.dueDate && !r.completedAt && !r.clearedAt)
	};
}

/** Visual sections are separate from date selection, keeping Schedule pinned to Today. */
export function reminderWidgetSections(reminders: Reminder[], today: string, selectedDate: string) {
	const groups = reminderWidgetGroups(reminders, today, selectedDate);
	const notes = (items: Reminder[]) => items.filter((r) => r.kind === 'note');
	const todos = (items: Reminder[]) => items.filter((r) => r.kind !== 'note');
	const sections =
		selectedDate !== today
			? [
					{
						id: 'selected',
						label: '',
						items: orderReminders(groups.selected),
						contextDate: selectedDate
					}
				]
			: [
					{ id: 'dated-notes', label: 'Notes', items: notes(groups.today), contextDate: today },
					{ id: 'undated-notes', label: '', items: notes(groups.anytime), contextDate: undefined },
					{ id: 'overdue', label: 'Overdue', items: groups.overdue, contextDate: undefined },
					{ id: 'dated-todos', label: 'To do', items: todos(groups.today), contextDate: today },
					{ id: 'undated-todos', label: '', items: todos(groups.anytime), contextDate: undefined }
				];
	return sections.filter((section) => section.items.length);
}

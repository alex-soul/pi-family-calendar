export interface Calendar {
	id: string;
	name: string;
	color: string;
	writable: boolean;
}

interface EventBase {
	id: string;
	calendarId: string;
	title: string;
	description?: string;
	location?: string;
}

/** All-day dates are local dates with an exclusive end, never midnight UTC instants. */
export type CalendarEvent = EventBase &
	(
		| { kind: 'timed'; start: string; end: string }
		| { kind: 'all-day'; startDate: string; endDate: string }
	);

export interface CalendarSnapshot {
	source: 'demo' | 'unconnected';
	calendars: Calendar[];
	events: CalendarEvent[];
	from: string;
	to: string;
	timeZone: string;
	fetchedAt: string;
}

export interface Reminder {
	kind: 'todo' | 'note';
	notes?: string;
	id: string;
	title: string;
	list: string;
	dueDate: string | null;
	completedAt: string | null;
	version: number;
}

export interface ReminderInput {
	kind?: 'todo' | 'note';
	notes?: string;
	title: string;
	list: string;
	dueDate: string | null;
}

export const reminderLists = ['Household', 'Personal 1', 'Personal 2'] as const;

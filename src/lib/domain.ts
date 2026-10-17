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
	googleUrl?: string;
}

/** All-day dates are local dates with an exclusive end, never midnight UTC instants. */
export type CalendarEvent = EventBase &
	(
		| { kind: 'timed'; start: string; end: string }
		| { kind: 'all-day'; startDate: string; endDate: string }
	);

export interface CalendarSnapshot {
	source: 'demo' | 'unconnected' | 'google';
	sync?: { stale: boolean; message?: string };
	calendars: Calendar[];
	events: CalendarEvent[];
	from: string;
	to: string;
	timeZone: string;
	fetchedAt: string;
}

export interface Reminder {
	repeat?: RepeatRule | null;
	completedDates?: Record<string, string>;
	completionWindows?: { date: string; through: string; completedAt: string }[];
	clearedAt?: string | null;
	occurrenceDate?: string;
	seriesEnded?: boolean;
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
	repeat?: RepeatRule | null;
	kind?: 'todo' | 'note';
	notes?: string;
	title: string;
	list: string;
	dueDate: string | null;
}

export interface RepeatRule {
	frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly';
	interval: number;
	until: string | null;
}

export const reminderLists = ['General'] as const;

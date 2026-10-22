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
	reminders?: Reminder[];
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
	categoryId?: string;
	category?: NoteCategory;
	repeat?: RepeatRule | null;
	/** Templates are stored; previews are unsaved views of a future template date. */
	preview?: boolean;
	occurrenceDate?: string;
	seriesEnded?: boolean;
	sourceTemplateId?: string;
	sourceDate?: string;
	createdOn?: string;
	dueTime?: string | null;
	showFrom?: string | null;
	showUntil?: string | null;
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
	categoryId?: string;
	dueTime?: string | null;
	showFrom?: string | null;
	showUntil?: string | null;
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

export interface NoteCategory {
	id: string;
	name: string;
	color: string;
	icon: string;
	version: number;
}

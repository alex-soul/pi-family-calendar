import type { Reminder } from './domain.ts';

/** Browsed dates must never stand in for the installation's actual local day. */
export function canCompleteReminder(item: Reminder, today: string): boolean {
	if (item.kind !== 'todo' || item.seriesEnded || item.clearedAt) return false;
	if (item.repeat && !item.occurrenceDate) return false;
	const date = item.occurrenceDate || item.dueDate;
	return date === null || date <= today;
}

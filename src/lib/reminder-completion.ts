import type { Reminder } from './domain.ts';

/** A template or preview can never be completed, even if a caller supplies a date. */
export function canCompleteReminder(item: Reminder, today: string): boolean {
	return (
		item.kind === 'todo' &&
		!item.repeat &&
		!item.preview &&
		(!item.dueDate || item.dueDate <= today)
	);
}

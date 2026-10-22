import type { Reminder } from './domain.ts';

const clocks = new Map<string, Intl.DateTimeFormat>();
export function localTime(now: Date, timeZone: string): string {
	let clock = clocks.get(timeZone);
	if (!clock) {
		clock = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		});
		clocks.set(timeZone, clock);
	}
	return clock.format(now);
}

export function isReminderOverdue(item: Reminder, today: string, time = '00:00'): boolean {
	return (
		item.kind === 'todo' &&
		!item.repeat &&
		!item.completedAt &&
		!!item.dueDate &&
		(item.dueDate < today || (item.dueDate === today && !!item.dueTime && item.dueTime <= time))
	);
}

export function noteVisibleNow(item: Reminder, time: string): boolean {
	return !item.showFrom || !item.showUntil || (item.showFrom <= time && time < item.showUntil);
}

export function compareReminderTime(a: Reminder, b: Reminder): number {
	return (
		(a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') ||
		(a.kind === 'note' ? a.showFrom || '24:00' : a.dueTime || '24:00').localeCompare(
			b.kind === 'note' ? b.showFrom || '24:00' : b.dueTime || '24:00'
		) ||
		a.title.localeCompare(b.title) ||
		a.id.localeCompare(b.id)
	);
}

export function reminderTimeLabel(item: Reminder): string {
	return item.kind === 'note' && item.showFrom && item.showUntil
		? `${item.showFrom}–${item.showUntil}`
		: item.dueTime || '';
}

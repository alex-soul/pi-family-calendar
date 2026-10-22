import { isReminderOverdue } from './reminder-time.ts';
import type { Reminder } from './domain.ts';
import { addDays, isDateKey } from './dates.ts';

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
export function occursOn(item: Reminder, date: string): boolean {
	if (!item.repeat || !item.dueDate) return item.dueDate === date;
	if (!isDateKey(date) || date < item.dueDate || (item.repeat.until && date > item.repeat.until))
		return false;
	const start = utc(item.dueDate),
		current = utc(date);
	const days = Math.round((current.getTime() - start.getTime()) / 86_400_000);
	const { frequency, interval } = item.repeat;
	if (frequency === 'daily') return days % interval === 0;
	if (frequency === 'weekdays') return current.getUTCDay() !== 0 && current.getUTCDay() !== 6;
	if (frequency === 'weekly') return days % (7 * interval) === 0;
	const months =
		(current.getUTCFullYear() - start.getUTCFullYear()) * 12 +
		current.getUTCMonth() -
		start.getUTCMonth();
	const lastDay = new Date(
		Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)
	).getUTCDate();
	return months % interval === 0 && current.getUTCDate() === Math.min(start.getUTCDate(), lastDay);
}

export function occurrence(item: Reminder, date: string): Reminder {
	return { ...item, dueDate: date, occurrenceDate: date, completedAt: null, preview: true };
}

/** Only a bounded next occurrence is needed; intervals are capped at 52 months. */
export function nextOccurrence(item: Reminder, from: string): Reminder | null {
	if (!item.repeat || !item.dueDate) return item;
	for (
		let date = from < item.dueDate ? item.dueDate : from, i = 0;
		i < 1600;
		i++, date = addDays(date, 1)
	) {
		if (!isDateKey(date) || (item.repeat.until && date > item.repeat.until)) return null;
		if (occursOn(item, date)) return occurrence(item, date);
	}
	return null;
}

export function reminderStatus(item: Reminder, today: string, time = '00:00'): string {
	if (item.preview) return 'Preview · repeating template';
	if (item.kind === 'note') return 'Note';
	if (item.completedAt) return 'Completed';
	return isReminderOverdue(item, today, time) ? 'Overdue' : 'To do';
}

/** Templates stay manageable even when no future occurrence remains. */
export function managementOccurrences(
	items: Reminder[],
	today: string,
	filter: 'active' | 'completed' | 'all'
): Reminder[] {
	return items.flatMap((item) => {
		if (!item.repeat) return [item];
		if (filter === 'completed') return [];
		const next = today === '9999-12-31' ? null : nextOccurrence(item, addDays(today, 1));
		return [next || { ...item, seriesEnded: true }];
	});
}

export function repeatLabel(item: Pick<Reminder, 'repeat'>): string {
	const rule = item.repeat;
	if (!rule) return '';
	if (rule.frequency === 'weekdays') return 'Every weekday';
	const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[rule.frequency];
	return rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
}

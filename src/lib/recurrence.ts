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
	return {
		...item,
		dueDate: date,
		occurrenceDate: date,
		completedAt: item.completedDates?.[date] || null,
		clearedAt: item.completedDates?.[date]
			? null
			: item.completionWindows?.find((w) => w.date <= date && date <= w.through)?.completedAt ||
				null
	};
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

/** The most recent scheduled occurrence on or before a day. */
export function latestOccurrence(item: Reminder, through: string): Reminder | null {
	if (!item.repeat || !item.dueDate) return item;
	for (
		let date = item.repeat.until && item.repeat.until < through ? item.repeat.until : through,
			i = 0;
		i < 1600 && date >= item.dueDate;
		i++, date = addDays(date, -1)
	) {
		if (occursOn(item, date)) return occurrence(item, date);
	}
	return null;
}

export function latestOutstanding(item: Reminder, through: string): Reminder | null {
	let last = latestOccurrence(item, through);
	while (last) {
		if (!last.completedAt && !last.clearedAt) return last;
		const date = last.dueDate!;
		const coveredStart =
			item.completionWindows
				?.filter((w) => w.date <= date && date <= w.through)
				.map((w) => w.date)
				.sort()[0] || date;
		if (coveredStart <= item.dueDate!) return null;
		last = latestOccurrence(item, addDays(coveredStart, -1));
	}
	return null;
}

/** The oldest unfinished occurrence, skipping covered ranges rather than expanding history. */
export function oldestOutstanding(item: Reminder, through: string): Reminder | null {
	if (item.kind === 'note' || item.completedAt || !item.dueDate) return null;
	if (!item.repeat) return item.dueDate <= through ? item : null;
	let next = nextOccurrence(item, item.dueDate);
	while (next && next.dueDate! <= through) {
		const date = next.dueDate!;
		if (!next.completedAt && !next.clearedAt) return next;
		const covered =
			item.completionWindows
				?.filter((w) => w.date <= date && date <= w.through)
				.map((w) => w.through)
				.sort()
				.at(-1) || date;
		if (covered === '9999-12-31') return null;
		next = nextOccurrence(item, addDays(covered, 1));
	}
	return null;
}

export function reminderStatus(item: Reminder, today: string): string {
	if (item.kind === 'note') return 'Note';
	if (item.completedAt) return 'Completed';
	if (item.clearedAt) return 'Cleared';
	return item.dueDate && item.dueDate < today ? 'Overdue' : 'To do';
}

/** A single series row for management; completed history is occurrence-specific. */
export function managementOccurrences(
	items: Reminder[],
	today: string,
	filter: 'active' | 'completed' | 'all'
): Reminder[] {
	return items.flatMap((item) => {
		if (!item.repeat) return [item];
		const history = Object.keys(item.completedDates || {})
			.filter((date) => occursOn(item, date))
			.sort()
			.map((date) => occurrence(item, date));
		if (filter === 'completed') return history;
		let next = oldestOutstanding(item, today) || nextOccurrence(item, today);
		while (next && (next.completedAt || next.clearedAt))
			next = next.dueDate === '9999-12-31' ? null : nextOccurrence(item, addDays(next.dueDate!, 1));
		if (filter === 'all') return [next || { ...item, seriesEnded: true }, ...history];
		return next ? [next] : [];
	});
}

export function repeatLabel(item: Pick<Reminder, 'repeat'>): string {
	const rule = item.repeat;
	if (!rule) return '';
	if (rule.frequency === 'weekdays') return 'Every weekday';
	const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[rule.frequency];
	return rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
}

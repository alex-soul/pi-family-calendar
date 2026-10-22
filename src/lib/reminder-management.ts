import type { Reminder } from './domain.ts';
import { compareReminderTime, isReminderOverdue } from './reminder-time.ts';

export type ReminderFilter = 'active' | 'completed' | 'all' | 'templates';
export type ReminderKindFilter = 'all' | 'todo' | 'note';

/** Groups keep future notes and old notes distinct from actionable to-dos. */
export function reminderGroups(
	items: Reminder[],
	today: string,
	filter: ReminderFilter,
	query = '',
	list = '',
	time = '00:00',
	kind: ReminderKindFilter = 'all'
) {
	const needle = query.trim().toLocaleLowerCase();
	const matching = items.filter((item) => {
		if (kind !== 'all' && item.kind !== kind) return false;
		if (list && item.list !== list) return false;
		if (needle && !`${item.title} ${item.notes || ''}`.toLocaleLowerCase().includes(needle))
			return false;
		if (filter === 'completed') return !!item.completedAt;
		if (filter === 'templates') return !!item.repeat;
		if (filter === 'active')
			return !item.completedAt && !(item.kind === 'note' && item.dueDate && item.dueDate < today);
		return true;
	});
	const groups = [
		'Today',
		'Overdue',
		'Upcoming',
		'Anytime',
		'Past notes',
		'Completed',
		'Repeating templates'
	].map((title) => ({ title, items: [] as Reminder[] }));
	for (const item of matching) {
		const group = item.repeat
			? 6
			: item.completedAt
				? 5
				: !item.dueDate
					? 3
					: isReminderOverdue(item, today, time)
						? 1
						: item.dueDate === today
							? 0
							: item.dueDate > today
								? 2
								: item.kind === 'note'
									? 4
									: 1;
		groups[group].items.push(item);
	}
	for (const group of groups) group.items.sort(compareReminderTime);
	return groups.filter((group) => group.items.length);
}

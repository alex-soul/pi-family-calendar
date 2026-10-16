import type { Reminder } from './domain.ts';

export type ReminderFilter = 'active' | 'completed' | 'all';

/** Groups keep future notes and old notes distinct from actionable to-dos. */
export function reminderGroups(
	items: Reminder[],
	today: string,
	filter: ReminderFilter,
	query = '',
	list = ''
) {
	const needle = query.trim().toLocaleLowerCase();
	const matching = items.filter((item) => {
		if (list && item.list !== list) return false;
		if (needle && !`${item.title} ${item.notes || ''}`.toLocaleLowerCase().includes(needle))
			return false;
		if (filter === 'completed') return !!item.completedAt;
		if (filter === 'active')
			return !item.completedAt && !(item.kind === 'note' && item.dueDate && item.dueDate < today);
		return true;
	});
	const groups = ['Today', 'Overdue', 'Upcoming', 'Anytime', 'Past notes', 'Completed'].map(
		(title) => ({ title, items: [] as Reminder[] })
	);
	for (const item of matching) {
		const group = item.completedAt
			? 5
			: !item.dueDate
				? 3
				: item.dueDate === today
					? 0
					: item.dueDate > today
						? 2
						: item.kind === 'note'
							? 4
							: 1;
		groups[group].items.push(item);
	}
	for (const group of groups)
		group.items.sort(
			(a, b) =>
				(a.dueDate || '').localeCompare(b.dueDate || '') ||
				Number(a.kind === 'note') - Number(b.kind === 'note') ||
				a.title.localeCompare(b.title)
		);
	return groups.filter((group) => group.items.length);
}

import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import type { ReminderFilter, ReminderKindFilter } from '#lib/reminder-management.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const filter = url.searchParams.get('filter') || 'active';
	const kind = url.searchParams.get('kind') || 'todo';
	const offset = Number(url.searchParams.get('offset') || 0);
	if (
		!['active', 'completed', 'past', 'templates'].includes(filter) ||
		!['note', 'todo'].includes(kind) ||
		!Number.isSafeInteger(offset) ||
		offset < 0
	)
		error(400, 'Invalid reminder filters.');
	return Response.json(
		reminderRepository().managementPage(
			filter as ReminderFilter,
			kind as ReminderKindFilter,
			url.searchParams.get('query') || '',
			url.searchParams.get('category') || '',
			offset
		)
	);
};

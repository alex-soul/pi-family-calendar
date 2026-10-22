import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => Response.json(reminderRepository().completedSummary());

export const DELETE: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Use a valid JSON body.');
	}
	if (!body || typeof body !== 'object' || !('revision' in body))
		error(400, 'Review the completed reminders before deleting them.');
	try {
		return Response.json({ deleted: reminderRepository().removeCompleted(body.revision) });
	} catch (cause) {
		if (cause instanceof ReminderError) error(cause.status, cause.message);
		throw cause;
	}
};

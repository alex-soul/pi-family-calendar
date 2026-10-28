import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = () => Response.json(reminderRepository().pastSummary());
export const DELETE: RequestHandler = async ({ request }) => {
	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Use a valid JSON body.');
	}
	try {
		return Response.json({ deleted: reminderRepository().removePast(body?.revision) });
	} catch (cause) {
		if (cause instanceof ReminderError) error(cause.status, cause.message);
		throw cause;
	}
};

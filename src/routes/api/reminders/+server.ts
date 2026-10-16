import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError, validateReminder } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => Response.json(reminderRepository().list());

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Use a valid JSON body.');
	}
	try {
		return Response.json(reminderRepository().create(validateReminder(body)), { status: 201 });
	} catch (cause) {
		if (cause instanceof ReminderError) error(cause.status, cause.message);
		throw cause;
	}
};

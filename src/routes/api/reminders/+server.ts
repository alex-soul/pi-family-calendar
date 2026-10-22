import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError, validateReminder } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	try {
		if (url.searchParams.has('from'))
			return Response.json(
				reminderRepository().query(url.searchParams.get('from')!, url.searchParams.get('to')!)
			);
		const offset = Number(url.searchParams.get('offset') || 0);
		if (!Number.isSafeInteger(offset) || offset < 0) error(400, 'Invalid page.');
		return Response.json(reminderRepository().page(offset));
	} catch (e) {
		if (e instanceof ReminderError) error(e.status, e.message);
		throw e;
	}
};

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

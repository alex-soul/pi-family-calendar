import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError, validateReminder } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		error(400, 'Use a valid JSON body.');
	}
	if (!body || !Number.isSafeInteger(body.version) || Number(body.version) < 1)
		error(400, 'A current version is required.');
	try {
		const repository = reminderRepository();
		if ('completed' in body) {
			if (typeof body.completed !== 'boolean') error(400, 'Completion must be true or false.');
			if (body.occurrenceDate !== undefined && typeof body.occurrenceDate !== 'string')
				error(400, 'Use a valid occurrence date.');
			return Response.json(
				repository.complete(
					params.id,
					Number(body.version),
					body.completed,
					body.occurrenceDate as string | undefined
				)
			);
		}
		return Response.json(
			repository.update(params.id, Number(body.version), validateReminder(body))
		);
	} catch (cause) {
		if (cause instanceof ReminderError) error(cause.status, cause.message);
		throw cause;
	}
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		error(400, 'Use a valid JSON body.');
	}
	if (!body || !Number.isSafeInteger(body.version) || Number(body.version) < 1)
		error(400, 'A current version is required.');
	try {
		reminderRepository().remove(params.id, Number(body.version));
		return new Response(null, { status: 204 });
	} catch (cause) {
		if (cause instanceof ReminderError) error(cause.status, cause.message);
		throw cause;
	}
};

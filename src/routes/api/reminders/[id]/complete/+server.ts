import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError } from '#lib/server/reminders.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const body = await request.json();
		if (
			!body ||
			typeof body !== 'object' ||
			Object.keys(body).some((k) => !['version', 'completed', 'occurrenceDate'].includes(k)) ||
			!Number.isSafeInteger(body.version) ||
			body.version < 1 ||
			typeof body.completed !== 'boolean' ||
			(body.occurrenceDate !== undefined && typeof body.occurrenceDate !== 'string')
		)
			throw new ReminderError('Use a current version and completion state only.', 400);
		return Response.json(
			reminderRepository().complete(params.id, body.version, body.completed, body.occurrenceDate)
		);
	} catch (cause) {
		if (cause instanceof ReminderError)
			return Response.json({ message: cause.message }, { status: cause.status });
		if (cause instanceof SyntaxError)
			return Response.json({ message: 'Invalid completion request.' }, { status: 400 });
		throw cause;
	}
};

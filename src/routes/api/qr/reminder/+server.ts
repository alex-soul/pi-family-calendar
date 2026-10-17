import { error } from '@sveltejs/kit';
import { qrAccess, reminderRepository } from '#lib/server/services.ts';
import { token, qrFailure } from '#lib/server/qr-http.ts';
import { validateReminder } from '#lib/server/reminders.ts';
export function GET({ request }) {
	try {
		const grant = qrAccess().session(token(request));
		const reminder = grant.id
			? reminderRepository()
					.list()
					.find((r) => r.id === grant.id)
			: null;
		if (grant.id && !reminder) error(404, 'Reminder no longer exists.');
		return Response.json({ ...grant, reminder });
	} catch (cause) {
		qrFailure(cause);
	}
}
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (!body || typeof body.requestId !== 'string') error(400, 'A save identifier is required.');
	try {
		const result = qrAccess().save(token(request), 'save-' + body.requestId, (grant) => {
			if ('id' in body || 'completed' in body || 'occurrenceDate' in body)
				error(400, 'Only reminder fields can be changed.');
			const input = validateReminder(body);
			if (grant.id) {
				if (!Number.isSafeInteger(body.version) || body.version < 1)
					error(400, 'A current version is required.');
				return reminderRepository().update(grant.id, body.version, input);
			}
			return reminderRepository().create(input);
		});
		return Response.json(result);
	} catch (cause) {
		qrFailure(cause);
	}
}

export async function DELETE({ request }) {
	const body = await request.json().catch(() => null);
	if (
		!body ||
		body.confirmed !== true ||
		typeof body.requestId !== 'string' ||
		!Number.isSafeInteger(body.version) ||
		body.version < 1
	)
		error(400, 'Confirm deletion with the current version.');
	if (Object.keys(body).some((key) => !['confirmed', 'requestId', 'version'].includes(key)))
		error(400, 'Only the scanned note can be deleted.');
	try {
		const result = qrAccess().save(token(request), 'delete-' + body.requestId, (grant) => {
			if (!grant.id) error(403, 'An Edit QR is required to delete a note.');
			const repo = reminderRepository();
			const item = repo.list().find((item) => item.id === grant.id);
			if (!item) error(404, 'Reminder no longer exists.');
			if (item.kind !== 'note') error(403, 'Only notes can be deleted through QR access.');
			repo.remove(item.id, body.version);
			return { id: item.id };
		});
		return Response.json(result);
	} catch (cause) {
		qrFailure(cause);
	}
}

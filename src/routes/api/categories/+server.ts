import { error } from '@sveltejs/kit';
import { reminderRepository } from '#lib/server/services.ts';
import { ReminderError } from '#lib/server/reminders.ts';
export function GET() {
	return Response.json(reminderRepository().categories());
}
export async function POST({ request }) {
	try {
		const body = await request.json();
		return Response.json(reminderRepository().saveCategory(body, body.id, body.version));
	} catch (e) {
		if (e instanceof ReminderError) error(e.status, e.message);
		error(400, 'Invalid category.');
	}
}
export async function DELETE({ request }) {
	try {
		const body = await request.json();
		if (typeof body.id !== 'string' || !Number.isSafeInteger(body.version))
			error(400, 'Choose a category and current version.');
		reminderRepository().removeCategory(body.id, body.version);
		return Response.json({ ok: true });
	} catch (e) {
		if (e instanceof ReminderError) error(e.status, e.message);
		error(400, 'Invalid category.');
	}
}

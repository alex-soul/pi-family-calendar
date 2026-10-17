import { error } from '@sveltejs/kit';
import { qrAccess, reminderRepository } from '#lib/server/services.ts';
import { token, qrFailure } from '#lib/server/qr-http.ts';
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (typeof body?.token !== 'string') error(400, 'Scan a new QR code.');
	try {
		const grant = qrAccess().redeem(body.token);
		const reminder = grant.id
			? reminderRepository()
					.list()
					.find((r) => r.id === grant.id)
			: null;
		if (grant.id && !reminder) {
			qrAccess().finish(grant.token);
			error(404, 'Reminder no longer exists.');
		}
		return Response.json({ ...grant, reminder });
	} catch (cause) {
		qrFailure(cause);
	}
}
export function DELETE({ request }) {
	qrAccess().finish(token(request));
	return new Response(null, { status: 204 });
}

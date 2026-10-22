import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { qrAccess, reminderRepository } from '#lib/server/services.ts';
import { qrFailure } from '#lib/server/qr-http.ts';
export async function POST({ request, url }) {
	const body = await request.json().catch(() => null);
	if (!body || !['add', 'edit'].includes(body.action)) error(400, 'Choose Add or Edit.');
	const id = body.action === 'edit' ? body.id : null;
	try {
		const target = typeof id === 'string' ? reminderRepository().get(id) : null;
		if (body.action === 'edit' && !target) error(404, 'Reminder no longer exists.');
		const origin = process.env.PUBLIC_BASE_URL || url.origin;
		const grant = qrAccess().issue(id, body.defaultDate, target?.repeat ? 'template' : 'item');
		const link = new URL('/reminder', origin);
		link.hash = grant.token;
		const image = await QRCode.toDataURL(link.href, {
			width: 320,
			margin: 4,
			errorCorrectionLevel: 'M'
		});
		return Response.json({ image, link: link.href, expires: grant.expires });
	} catch (cause) {
		qrFailure(cause);
	}
}

import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { googleCalendars, timeZone } from '#lib/server/services.ts';
import { SetupError } from '#lib/server/google.ts';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	try {
		const link =
			body?.action === 'add'
				? googleCalendars().newEventLink(body?.date, timeZone, body?.allDay, body?.endDate)
				: await googleCalendars().eventLink(body?.id);
		const image = await QRCode.toDataURL(link, {
			width: 320,
			margin: 4,
			errorCorrectionLevel: 'M'
		});
		return Response.json({ link, image });
	} catch (cause) {
		if (cause instanceof SetupError) error(cause.status, cause.message);
		error(503, 'Could not prepare the Google Calendar link. Try again.');
	}
}

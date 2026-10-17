import { error } from '@sveltejs/kit';
import { googleCalendars } from '#lib/server/services.ts';
import { SetupError } from '#lib/server/google.ts';
export function GET() {
	return Response.json(googleCalendars().eventQrSettings());
}
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	try {
		googleCalendars().configureEventQr(body?.enabled, body?.calendarId);
		return Response.json(googleCalendars().eventQrSettings());
	} catch (cause) {
		if (cause instanceof SetupError) error(cause.status, cause.message);
		throw cause;
	}
}

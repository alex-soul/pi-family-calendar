import { qrAccess, googleCalendars } from '#lib/server/services.ts';
export function GET() {
	return Response.json({
		enabled: qrAccess().enabled(),
		eventQrEnabled: googleCalendars().eventQrSettings().available
	});
}

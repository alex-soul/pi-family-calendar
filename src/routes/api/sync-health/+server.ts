import { googleCalendars } from '#lib/server/services.ts';
export function GET() {
	return Response.json(googleCalendars().publicHealth(), {
		headers: { 'Cache-Control': 'no-store' }
	});
}

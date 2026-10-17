import { qrAccess } from '#lib/server/services.ts';
export function GET() {
	return Response.json({ enabled: qrAccess().enabled() });
}

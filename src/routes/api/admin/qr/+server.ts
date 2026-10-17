import { error } from '@sveltejs/kit';
import { qrAccess } from '#lib/server/services.ts';
export function GET() {
	return Response.json({ enabled: qrAccess().enabled() });
}
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (typeof body?.enabled !== 'boolean') error(400, 'Choose on or off.');
	qrAccess().configure(body.enabled);
	return Response.json({ enabled: qrAccess().enabled() });
}

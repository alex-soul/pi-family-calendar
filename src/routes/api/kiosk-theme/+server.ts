import { error } from '@sveltejs/kit';
import { hostThemeAuthorized, kioskTheme, themeEnabled } from '#lib/server/kiosk-theme.ts';
export function GET({ request }) {
	if (!themeEnabled() || !hostThemeAuthorized(request.headers.get('authorization')))
		error(403, 'Theme control unavailable.');
	return Response.json(kioskTheme().status());
}
export async function POST({ request }) {
	if (!themeEnabled()) error(503, 'Theme control unavailable.');
	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid theme request.');
	try {
		if (hostThemeAuthorized(request.headers.get('authorization')))
			return Response.json(kioskTheme().command(body.theme));
		return Response.json(
			kioskTheme().exchange(
				request.headers.get('authorization')?.replace(/^Bearer /, '') || '',
				body
			)
		);
	} catch {
		error(409, 'Kiosk theme unavailable or session expired. Reload the kiosk to reconnect.');
	}
}

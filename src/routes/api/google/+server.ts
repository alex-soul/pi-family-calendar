import { error } from '@sveltejs/kit';
import { addDays, dateKey, monthGrid } from '#lib/dates.ts';
import { googleCalendars, timeZone } from '#lib/server/services.ts';
import { SetupError } from '#lib/server/google.ts';
import { GoogleFailure } from '#lib/server/google-api.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ url }) =>
	Response.json({
		...googleCalendars().status(),
		redirectUri: url.origin + '/api/google/callback'
	});
export const POST: RequestHandler = async ({ request, url, cookies }) => {
	try {
		const input = await request.json();
		const google = googleCalendars();
		if (!input || typeof input !== 'object')
			throw new SetupError('Choose a Google settings action.');
		switch (input.action) {
			case 'configure':
				google.saveConfig(input);
				break;
			case 'connect': {
				const result = google.begin(url.origin);
				cookies.set('google-connect', result.binding, {
					path: '/api/google',
					httpOnly: true,
					sameSite: 'lax',
					secure: url.protocol === 'https:',
					maxAge: 600
				});
				return Response.json({ url: result.url });
			}
			case 'select':
				google.select(input.accountId, input.calendarIds);
				break;
			case 'disconnect':
				if (typeof input.accountId !== 'string') throw new SetupError('Choose an account.');
				google.disconnect(input.accountId);
				break;
			case 'sync': {
				const grid = monthGrid(dateKey(new Date(), timeZone));
				const snapshot = await google.snapshot(grid[0], addDays(grid[41], 8), timeZone, true);
				return Response.json({ snapshot, status: google.status() });
			}
			default:
				throw new SetupError('Unknown Google settings action.');
		}
		return Response.json(google.status());
	} catch (cause) {
		if (cause instanceof SetupError) error(cause.status, cause.message);
		if (cause instanceof GoogleFailure) error(502, cause.message);
		if (cause instanceof SyntaxError) error(400, 'Invalid settings request.');
		error(500, 'Google settings could not be saved. Check the server data directory.');
	}
};

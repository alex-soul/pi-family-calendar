import { error } from '@sveltejs/kit';
import { systemStatus } from '#lib/server/system.ts';
import { googleCalendars, timeZone } from '#lib/server/services.ts';
import { SetupError } from '#lib/server/google.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async () => Response.json(await systemStatus());
export const POST: RequestHandler = async ({ request }) => {
	const input = await request.json().catch(() => null);
	try {
		if (input?.action === 'interval') googleCalendars().setIntervalSeconds(input.seconds);
		else if (input?.action === 'sync')
			void googleCalendars()
				.syncNow(timeZone)
				.catch(() => {});
		else error(400, 'Choose a system action.');
	} catch (cause) {
		if (cause instanceof SetupError) error(cause.status, cause.message);
		throw cause;
	}
	return Response.json(await systemStatus());
};

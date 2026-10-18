import { permittedOrigin, validatePublicOrigin } from '#lib/server/network.ts';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/env';
import {
	adminAccess,
	googleCalendars,
	timeZone,
	quiesceServices,
	shutdownServices
} from '#lib/server/services.ts';
import { ADMIN_COOKIE, requiresAdmin } from '#lib/server/admin.ts';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';

export const init: ServerInit = () => {
	if (!building) {
		validatePublicOrigin();
		googleCalendars().start(timeZone);
		process.once('calendar:quiesce', quiesceServices);
		process.once('calendar:shutdown', shutdownServices);
	}
};

/** Only explicitly configured origins are served; mutations must use that same origin. */
export const handle: Handle = async ({ event, resolve }) => {
	if (!permittedOrigin(event.url.origin, event.request.headers.get('host'))) {
		return new Response('This address is not enabled.', { status: 403 });
	}
	if (
		!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
		event.request.headers.get('origin') !== event.url.origin
	) {
		return new Response('Same-origin requests are required.', { status: 403 });
	}
	const route = event.route.id || event.url.pathname;
	const access = adminAccess();
	event.locals.admin = {
		pinEnabled: access.enabled(),
		unlocked: access.authorized(event.cookies.get(ADMIN_COOKIE))
	};
	let response: Response;
	if (requiresAdmin(route, event.request.method) && !event.locals.admin.unlocked) {
		const next = route.startsWith('/api/google') ? '/admin/google' : event.url.pathname;
		if (route.startsWith('/api/') && route !== '/api/google/callback')
			response = Response.json(
				{ message: 'Admin is locked. Open /admin to unlock it.' },
				{ status: 401 }
			);
		else {
			event.setHeaders({ 'Cache-Control': 'no-store' });
			redirect(303, '/admin/login?next=' + encodeURIComponent(next));
		}
	} else response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Frame-Options', 'DENY');
	if (!event.url.pathname.startsWith('/_app/')) response.headers.set('Cache-Control', 'no-store');
	return response;
};

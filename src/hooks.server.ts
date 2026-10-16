import { redirect } from '@sveltejs/kit';
import { adminAccess } from '#lib/server/services.ts';
import { ADMIN_COOKIE, requiresAdmin } from '#lib/server/admin.ts';
import type { Handle } from '@sveltejs/kit/hooks';

/** This first build is a local development preview. LAN pairing/auth is a later milestone. */
export const handle: Handle = async ({ event, resolve }) => {
	// Reject non-local Host values as well as non-local peers (including DNS rebinding).
	let host: string;
	try {
		host = new URL('http://' + event.request.headers.get('host')).hostname;
	} catch {
		return new Response('Invalid host.', { status: 400 });
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
		return new Response('Local host required.', { status: 403 });
	const address = event.getClientAddress();
	const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
	// A container's published loopback port reaches Node via the Docker bridge.
	// Explicitly opt in only behind the loopback binding in the supplied Compose file.
	if (!loopback && process.env.LOOPBACK_PROXY !== '1') {
		return new Response(
			'This development build accepts local connections only. LAN access is not enabled.',
			{ status: 403 }
		);
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

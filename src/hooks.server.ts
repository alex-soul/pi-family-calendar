import type { Handle } from '@sveltejs/kit/hooks';

/** This first build is a local development preview. LAN pairing/auth is a later milestone. */
export const handle: Handle = async ({ event, resolve }) => {
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
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	if (!event.url.pathname.startsWith('/_app/')) response.headers.set('Cache-Control', 'no-store');
	return response;
};

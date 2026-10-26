import { googleCalendars, timeZone } from '#lib/server/services.ts';
import { oauthLoopbackOrigin } from '#lib/server/network.ts';
export function load({ url }: { url: URL }) {
	return {
		google: googleCalendars().status(),
		sync: googleCalendars().systemStatus(),
		timeZone,
		localConnection: ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
		helperPort: new URL(oauthLoopbackOrigin()).port,
		redirectUri:
			(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
				? url.origin
				: oauthLoopbackOrigin()) + '/api/google/callback',
		result: ['connected', 'cancelled', 'failed'].includes(url.searchParams.get('result') || '')
			? url.searchParams.get('result')
			: null
	};
}

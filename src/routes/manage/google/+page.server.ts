import { googleCalendars } from '#lib/server/services.ts';
export function load({ url }: { url: URL }) {
	return {
		google: googleCalendars().status(),
		redirectUri: url.origin + '/api/google/callback',
		result: ['connected', 'cancelled', 'failed'].includes(url.searchParams.get('result') || '')
			? url.searchParams.get('result')
			: null
	};
}

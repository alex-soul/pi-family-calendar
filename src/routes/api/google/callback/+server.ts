import { redirect } from '@sveltejs/kit';
import { googleCalendars } from '#lib/server/services.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ url, cookies }) => {
	const binding = cookies.get('google-connect');
	cookies.delete('google-connect', { path: '/api/google' });
	let result = 'connected';
	try {
		await googleCalendars().finish(
			url.searchParams.get('state'),
			binding,
			url.searchParams.get('code')
		);
	} catch {
		result = url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'failed';
	}
	// Never render/log the authorization code, provider response, tokens or raw error.
	redirect(303, '/admin/google?result=' + result);
};

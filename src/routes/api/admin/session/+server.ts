import { adminAccess } from '#lib/server/services.ts';
import { ADMIN_COOKIE, SESSION_SECONDS, AdminError } from '#lib/server/admin.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const body = await request.json();
		if (body?.action === 'lock') {
			adminAccess().logout(cookies.get(ADMIN_COOKIE));
			cookies.delete(ADMIN_COOKIE, { path: '/' });
			return Response.json({ ok: true });
		}
		if (body?.action !== 'unlock') throw new AdminError('Choose an access action.');
		const token = await adminAccess().login(body.pin);
		if (token)
			cookies.set(ADMIN_COOKIE, token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: url.protocol === 'https:',
				maxAge: SESSION_SECONDS
			});
		return Response.json({ ok: true });
	} catch (cause) {
		if (cause instanceof AdminError)
			return Response.json({ message: cause.message }, { status: cause.status });
		if (cause instanceof SyntaxError)
			return Response.json({ message: 'Invalid request.' }, { status: 400 });
		return Response.json({ message: 'Could not unlock admin.' }, { status: 500 });
	}
};

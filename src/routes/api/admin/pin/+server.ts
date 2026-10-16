import { adminAccess } from '#lib/server/services.ts';
import { ADMIN_COOKIE, SESSION_SECONDS, AdminError } from '#lib/server/admin.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const body = await request.json();
		const token = await adminAccess().configure(
			body?.currentPin,
			body?.newPin,
			cookies.get(ADMIN_COOKIE)
		);
		if (token)
			cookies.set(ADMIN_COOKIE, token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: url.protocol === 'https:',
				maxAge: SESSION_SECONDS
			});
		else cookies.delete(ADMIN_COOKIE, { path: '/' });
		return Response.json({ pinEnabled: adminAccess().enabled() });
	} catch (cause) {
		if (cause instanceof AdminError)
			return Response.json({ message: cause.message }, { status: cause.status });
		if (cause instanceof SyntaxError)
			return Response.json({ message: 'Invalid request.' }, { status: 400 });
		return Response.json({ message: 'Could not update PIN protection.' }, { status: 500 });
	}
};

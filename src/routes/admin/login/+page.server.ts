import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
	const candidate = url.searchParams.get('next');
	const next = [
		'/admin',
		'/admin/reminders',
		'/admin/google',
		'/admin/settings',
		'/admin/access',
		'/admin/system',
		'/admin/screen'
	].includes(candidate || '')
		? candidate!
		: '/admin';
	if (locals.admin.unlocked) redirect(303, next);
	return { next };
};

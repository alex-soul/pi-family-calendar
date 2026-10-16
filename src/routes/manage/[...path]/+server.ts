import { redirect } from '@sveltejs/kit';
export function GET({ params }: { params: { path?: string } }) {
	redirect(303, params.path === 'google' ? '/admin/google' : '/admin/reminders');
}

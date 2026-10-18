import { systemStatus } from '#lib/server/system.ts';
export async function load({ locals }) {
	return { system: await systemStatus(), pinEnabled: locals.admin.pinEnabled };
}

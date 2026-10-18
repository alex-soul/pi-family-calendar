import { error } from '@sveltejs/kit';
import { ADMIN_COOKIE } from '#lib/server/admin.ts';
import {
	ApplianceError,
	applianceRequest,
	applianceStatus,
	displayRequest,
	invalidateAppliance,
	powerOwner
} from '#lib/server/appliance.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => Response.json(await applianceStatus());
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const input = await request.json().catch(() => null);
	try {
		if (!locals.admin.unlocked) error(401, 'Unlock admin to continue.');
		if (input?.kind === 'display') {
			const result = await applianceRequest({
				kind: 'display',
				request: displayRequest(input.request)
			});
			invalidateAppliance();
			return Response.json(result);
		}
		if (input?.kind === 'power') {
			const owner = powerOwner(locals.admin, cookies.get(ADMIN_COOKIE));
			if (
				!['reboot', 'shutdown'].includes(input.action) ||
				!['prepare', 'confirm'].includes(input.operation)
			)
				error(400, 'Choose a power action.');
			if (
				input.operation === 'confirm' &&
				(typeof input.confirmation !== 'string' || !/^[a-f0-9]{64}$/.test(input.confirmation))
			)
				error(400, 'Start the confirmation again.');
			return Response.json(
				await applianceRequest({
					kind: 'power',
					request: {
						operation: input.operation,
						action: input.action,
						owner,
						...(input.operation === 'confirm' ? { confirmation: input.confirmation } : {})
					}
				})
			);
		}
		error(400, 'Choose a device action.');
	} catch (cause) {
		if (cause instanceof ApplianceError) error(cause.status, cause.message);
		throw cause;
	}
};

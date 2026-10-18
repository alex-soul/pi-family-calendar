import { reminderRepository } from '#lib/server/services.ts';
import { buildInfo } from '#lib/server/build-info.ts';
export function GET() {
	reminderRepository().list();
	return Response.json({
		status: 'ok',
		application: 'pi-family-calendar',
		version: buildInfo().version
	});
}

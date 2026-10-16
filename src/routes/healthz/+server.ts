import { reminderRepository } from '#lib/server/services.ts';
export function GET() {
	reminderRepository().list();
	return Response.json({ status: 'ok', version: '0.1.0-dev' });
}

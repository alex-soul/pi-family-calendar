import { error } from '@sveltejs/kit';
import { QrError } from './qr.ts';
import { ReminderError } from './reminders.ts';
export function token(request: Request) {
	return (request.headers.get('authorization') || '').replace(/^Bearer /, '');
}
export function qrFailure(cause: unknown): never {
	if (cause instanceof QrError || cause instanceof ReminderError)
		error(cause.status, cause.message);
	throw cause;
}

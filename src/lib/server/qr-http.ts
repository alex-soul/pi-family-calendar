import { error } from '@sveltejs/kit';
import { QrError } from './qr.ts';
import { ReminderError } from './reminders.ts';
import type { Grant } from './qr.ts';
import type { Reminder } from '../domain.ts';
export function requireQrTarget(grant: Grant, reminder: Reminder | null | undefined) {
	if (!grant.id) return;
	if (!reminder) throw new QrError('Reminder no longer exists.', 404);
	if (reminder.id !== grant.id || grant.targetType !== (reminder.repeat ? 'template' : 'item'))
		throw new QrError('This QR target has changed. Scan a new QR code.');
}
export function token(request: Request) {
	return (request.headers.get('authorization') || '').replace(/^Bearer /, '');
}
export function qrFailure(cause: unknown): never {
	if (cause instanceof QrError || cause instanceof ReminderError)
		error(cause.status, cause.message);
	throw cause;
}

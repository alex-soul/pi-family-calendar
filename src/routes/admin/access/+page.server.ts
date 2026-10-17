import { qrAccess } from '#lib/server/services.ts';
export function load() {
	return { qrEnabled: qrAccess().enabled() };
}

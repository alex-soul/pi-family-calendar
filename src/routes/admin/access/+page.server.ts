import { qrAccess, googleCalendars } from '#lib/server/services.ts';
export function load() {
	return { qrEnabled: qrAccess().enabled(), eventQr: googleCalendars().eventQrSettings() };
}

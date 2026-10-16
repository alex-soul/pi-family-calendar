import { timeZone } from '#lib/server/services.ts';
export function load() {
	return { timeZone, version: '0.1.0-dev' };
}

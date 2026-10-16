import { systemStatus } from '#lib/server/system.ts';
export function load() {
	return { system: systemStatus() };
}

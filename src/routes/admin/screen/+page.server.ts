import { applianceStatus } from '#lib/server/appliance.ts';
export async function load() {
	return { appliance: await applianceStatus() };
}

import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { googleCalendars, reminderRepository, timeZone } from './services.ts';
import { applianceStatus } from './appliance.ts';
import { buildInfo } from './build-info.ts';
export async function systemStatus() {
	const directory = resolve(process.env.DATA_DIR || 'data');
	let databaseBytes = 0;
	for (const file of readdirSync(directory))
		if (/\.sqlite(?:-wal|-shm)?$/.test(file)) databaseBytes += statSync(join(directory, file)).size;
	return {
		appliance: await applianceStatus(),
		version: buildInfo().version,
		timeZone,
		uptimeSeconds: Math.floor(process.uptime()),
		appMemoryBytes: process.memoryUsage().rss,
		databaseBytes,
		reminderCount: reminderRepository().list().length,
		calendar: googleCalendars().systemStatus()
	};
}

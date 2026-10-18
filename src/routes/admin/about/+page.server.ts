import { buildInfo } from '#lib/server/build-info.ts';

export function load() {
	return { build: buildInfo() };
}

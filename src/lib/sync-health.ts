export type SyncHealth = 'healthy' | 'error' | 'unknown' | 'disabled';
export function syncLight(status: SyncHealth, checkedAt: number, now: number) {
	const state = checkedAt && now - checkedAt > 90000 ? 'error' : status;
	return {
		state,
		label:
			state === 'healthy'
				? 'Synchronization healthy'
				: state === 'error'
					? 'Synchronization or connection problem'
					: state === 'disabled'
						? 'Synchronization not enabled'
						: 'Checking synchronization'
	};
}

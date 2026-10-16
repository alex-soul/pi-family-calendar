/** Blank/null means disabled; only positive whole seconds are accepted. */
export function seconds(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function inactivityPreferences(saved: Record<string, unknown>) {
	const legacy = [0, 15, 30, 60].includes(saved.idleSeconds as number)
		? (saved.idleSeconds as number)
		: 15;
	return {
		resetScrollSeconds:
			'resetScrollSeconds' in saved ? seconds(saved.resetScrollSeconds) : seconds(legacy),
		returnTodaySeconds:
			'returnTodaySeconds' in saved
				? seconds(saved.returnTodaySeconds)
				: legacy === 0
					? undefined
					: 60
	};
}

export function idleReached(elapsed: number, delay: number | undefined): boolean {
	return delay !== undefined && elapsed >= delay * 1000;
}

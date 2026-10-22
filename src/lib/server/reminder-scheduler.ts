import { dateKey } from '../dates.ts';
import { localTime } from '../reminder-time.ts';
import type { SqliteReminders } from './reminders.ts';

/** A delayed timer may enter its scheduled minute by at most five seconds. Never catch up. */
export function generationSlot(
	expected: number,
	actual: number,
	zone: string
): '00:00' | '01:00' | null {
	if (actual < expected || actual - expected > 5000) return null;
	const time = localTime(new Date(actual), zone);
	return time === '00:00' || time === '01:00' ? time : null;
}

export function startReminderScheduler(repository: SqliteReminders, zone: string): () => void {
	let timer: ReturnType<typeof setTimeout>;
	let stopped = false;
	function arm() {
		if (stopped) return;
		const now = Date.now();
		const expected = Math.floor(now / 60000) * 60000 + 60000;
		timer = setTimeout(() => {
			const actual = Date.now();
			const slot = generationSlot(expected, actual, zone);
			try {
				if (slot) {
					const result = repository.generate(dateKey(new Date(actual), zone), slot);
					if (!result.skipped) console.info('Reminder generation', { slot, ...result });
				}
			} catch {
				console.error('Reminder generation failed at its scheduled slot.');
			} finally {
				arm();
			}
		}, expected - now);
		timer.unref();
	}
	// Always schedule a future boundary; startup inside a slot does not replay it.
	arm();
	return () => {
		stopped = true;
		clearTimeout(timer);
	};
}

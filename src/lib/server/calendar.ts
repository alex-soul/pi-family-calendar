import type { Calendar, CalendarEvent, CalendarSnapshot } from '../domain.ts';
import { addDays } from '../dates.ts';

/** Google will implement this read boundary; write semantics remain a separate decision. */
export interface CalendarProvider {
	snapshot(from: string, to: string, timeZone: string): Promise<CalendarSnapshot>;
}

const calendars: Calendar[] = [
	{ id: 'household', name: 'Household', color: '#7b9b80', writable: false },
	{ id: 'personal-1', name: 'Personal 1', color: '#b58b65', writable: false },
	{ id: 'personal-2', name: 'Personal 2', color: '#a692c5', writable: false },
	{ id: 'work', name: 'Work', color: '#759bac', writable: false }
];

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
// Fictional daytime fixture conversion only. Real providers must supply offset-bearing instants.
function sampleInstant(date: string, hour: number, minute: number, timeZone: string): string {
	const desired = Date.parse(
		`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`
	);
	let result = desired;
	let format = zoneFormatters.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat('sv-SE', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		});
		zoneFormatters.set(timeZone, format);
	}
	for (let i = 0; i < 3; i++) {
		const parts = format.formatToParts(new Date(result));
		const part = (name: string) => parts.find((p) => p.type === name)!.value;
		const represented = Date.parse(
			`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`
		);
		result += desired - represented;
	}
	return new Date(result).toISOString();
}

export class DemoCalendarProvider implements CalendarProvider {
	async snapshot(from: string, to: string, timeZone: string): Promise<CalendarSnapshot> {
		const events: CalendarEvent[] = [];
		for (let date = from; date < to; date = addDays(date, 1)) {
			const day = new Date(`${date}T12:00:00Z`).getUTCDay();
			const timed = (
				id: string,
				title: string,
				calendarId: string,
				hour: number,
				minute: number,
				duration: number,
				location?: string
			) => {
				const start = sampleInstant(date, hour, minute, timeZone);
				events.push({
					id: `${date}-${id}`,
					title,
					calendarId,
					kind: 'timed',
					start,
					end: new Date(Date.parse(start) + duration * 60_000).toISOString(),
					location,
					description:
						'Fictional sample event for exploring the display. No Google account is connected.'
				});
			};
			if (day > 0 && day < 6) {
				timed('morning', 'Morning walk', 'personal-1', 8, 15, 30, 'Riverside park');
				timed('work', 'Project catch-up', 'work', 10, 0, 45);
				timed('pickup', 'School pickup', 'household', 15, 15, 30, 'Main entrance');
				timed('swim', 'Swimming lesson', 'household', 16, 30, 45, 'Leisure centre');
				timed('appointment', 'Appointment', 'personal-2', 16, 30, 30);
				timed('dinner', 'Dinner together', 'household', 18, 30, 60);
			} else if (day === 6) {
				timed('market', 'Farmers market', 'household', 9, 30, 60);
				timed('coffee', 'Coffee with a friend', 'personal-1', 11, 0, 45);
				timed('library', 'Library visit', 'household', 12, 0, 60);
				timed('garden', 'Garden centre', 'personal-2', 14, 0, 90);
				timed('film', 'Film night', 'household', 19, 0, 120);
			} else {
				timed('lunch', 'Sunday lunch', 'household', 13, 0, 90);
			}
			if (day === 5 || day === 6) {
				for (const [id, title, calendarId] of [
					['birthday', 'A birthday', 'household'],
					['delivery', 'Delivery expected', 'personal-1'],
					['school', 'School notices to read', 'household']
				])
					events.push({
						id: `${date}-${id}`,
						title,
						calendarId,
						kind: 'all-day',
						startDate: date,
						endDate: addDays(date, 1)
					});
			}
		}
		return {
			source: 'demo',
			calendars,
			events,
			from,
			to,
			timeZone,
			fetchedAt: new Date().toISOString()
		};
	}
}

export class UnconnectedCalendarProvider implements CalendarProvider {
	async snapshot(from: string, to: string, timeZone: string): Promise<CalendarSnapshot> {
		return {
			source: 'unconnected',
			calendars: [],
			events: [],
			from,
			to,
			timeZone,
			fetchedAt: new Date().toISOString()
		};
	}
}

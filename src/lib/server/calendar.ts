import type { Calendar, CalendarEvent, CalendarSnapshot } from '../domain.ts';
import { addDays, dateKey, startOfWeek } from '../dates.ts';

/** Google will implement this read boundary; write semantics remain a separate decision. */
export interface CalendarProvider {
	snapshot(from: string, to: string, timeZone: string): Promise<CalendarSnapshot>;
}

const calendars: Calendar[] = [
	{ id: 'household', name: 'Family', color: '#83b49a', writable: false },
	{ id: 'personal-1', name: 'Personal', color: '#dfa46c', writable: false },
	{ id: 'personal-2', name: 'School', color: '#b49bdf', writable: false },
	{ id: 'work', name: 'Work', color: '#77b9d3', writable: false }
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
					description: (
						{
							morning: 'Take the riverside path',
							work: 'Review the next milestone and open questions',
							pickup: 'Meet at the main entrance',
							swim: 'Bring goggles, a towel and the blue swimming bag',
							appointment: 'Bring the booking confirmation',
							dinner: 'Pasta and salad',
							market: 'Bread, fruit and vegetables for the week',
							coffee: 'Meet at the corner café',
							library: 'Return books and choose something new',
							garden: 'Pick up bulbs for the garden',
							film: 'Choose a film together after dinner',
							lunch: 'Bring something to share'
						} as Record<string, string>
					)[id]
				});
			};

			// A varied fictional household week, suitable for public screenshots.
			const week: [string, string, string, number, number, number, string?][][] = [
				[
					['swim', 'Family swim', 'household', 10, 0, 60, 'Leisure centre'],
					['lunch', 'Sunday lunch with grandparents', 'household', 13, 0, 90],
					['walk', 'Woodland walk', 'personal-1', 16, 0, 60, 'Oakwood trail'],
					['film', 'Film & popcorn', 'household', 18, 30, 90]
				],
				[
					['work', 'Weekly planning', 'work', 9, 30, 45],
					['piano', 'Mia · piano lesson', 'personal-2', 16, 0, 45, 'Music room'],
					['yoga', 'Evening yoga', 'personal-1', 18, 30, 60]
				],
				[
					['design', 'Design review', 'work', 10, 0, 60],
					['football', 'Leo · football practice', 'personal-2', 16, 30, 60, 'Sports ground']
				],
				[
					['coffee', 'Coffee with Jamie', 'personal-1', 9, 0, 45, 'The Corner Café'],
					['swim', 'Mia · swimming lesson', 'personal-2', 16, 0, 45, 'Leisure centre'],
					['dinner', 'Dinner together', 'household', 18, 30, 60]
				],
				[
					['work', 'Team catch-up', 'work', 10, 30, 30],
					['library', 'Library club', 'personal-2', 15, 45, 60, 'Town library']
				],
				[
					['work', 'Weekly wrap-up', 'work', 11, 0, 30],
					['pizza', 'Homemade pizza night', 'household', 18, 0, 90]
				],
				[
					['market', 'Farmers’ market', 'household', 9, 30, 60, 'Market square'],
					['match', 'Leo · football match', 'personal-2', 11, 0, 75, 'Sports ground'],
					['baking', 'Afternoon baking', 'household', 15, 0, 90]
				]
			];
			if (day > 0 && day < 6)
				timed('morning', 'Morning walk', 'personal-1', 8, 15, 30, 'Riverside park');
			for (const item of week[day]) timed(...item);
		}
		const today = dateKey(new Date(), timeZone);
		const monday = startOfWeek(today);
		const extras = [
			{
				id: 'birthday',
				title: 'Emma’s birthday',
				calendarId: 'household',
				startDate: today,
				days: 1
			},
			{
				id: 'trip',
				title: 'Weekend by the coast',
				calendarId: 'household',
				startDate: addDays(monday, 11),
				days: 3
			},
			{
				id: 'half-term',
				title: 'Half-term break',
				calendarId: 'personal-2',
				startDate: addDays(monday, 14),
				days: 5
			},
			{
				id: 'delivery',
				title: 'Garden delivery',
				calendarId: 'personal-1',
				startDate: addDays(monday, 8),
				days: 1
			}
		];
		for (const item of extras) {
			const endDate = addDays(item.startDate, item.days);
			if (item.startDate < to && endDate > from)
				events.push({
					id: item.id,
					title: item.title,
					calendarId: item.calendarId,
					kind: 'all-day',
					startDate: item.startDate,
					endDate
				});
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

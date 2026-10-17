<script lang="ts">
	import AddEventButton from './AddEventButton.svelte';
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import { monthWeek, dayTime, eventDates } from '../month.ts';
	let {
		dates,
		monthDate,
		today,
		events,
		calendars,
		timeZone,
		expandedDate = $bindable(null),
		ondate,
		onopen,
		onadd
	}: {
		dates: string[];
		monthDate: string;
		today: string;
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		expandedDate: string | null;
		ondate: (date: string) => void;
		onadd?: (date: string) => void;
		onopen: (event: CalendarEvent) => void;
	} = $props();
	let limit = $derived(dates.length > 35 ? 2 : 3);
	let weeks = $derived(
		Array.from({ length: dates.length / 7 }, (_, i) => {
			const days = dates.slice(i * 7, i * 7 + 7),
				segments = monthWeek(events, days, timeZone);
			const expanded = expandedDate !== null && days.includes(expandedDate);
			return {
				days,
				segments,
				expanded,
				overflow: segments.some((s) => s.lane >= limit),
				lanes: expanded ? Math.max(limit, ...segments.map((s) => s.lane + 1)) : limit
			};
		})
	);
</script>

<div
	class="month-view spanning-month"
	style:grid-template-rows={`24px ${weeks.map((w) => (w.expanded ? `${28 + w.lanes * 21 + (w.overflow ? 19 : 0)}px` : `minmax(${28 + w.lanes * 21 + (w.overflow ? 19 : 0)}px,1fr)`)).join(' ')}`}
>
	<div class="month-weekdays">
		{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}<span class="month-weekday"
				>{day}</span
			>{/each}
	</div>
	{#each weeks as week}
		<section
			class="month-week"
			style:grid-template-rows={`28px repeat(${week.lanes},21px) ${week.overflow ? 19 : 0}px minmax(0,1fr)`}
		>
			{#each week.days as date, col}
				<div
					class="month-cell"
					class:outside={date.slice(0, 7) !== monthDate.slice(0, 7)}
					style:grid-column={col + 1}
					style:grid-row="1 / -1"
				>
					<div class="month-date-actions">
						<button
							class="month-date"
							class:today={date === today}
							aria-label={dateLabel(date, {
								weekday: 'long',
								day: 'numeric',
								month: 'long',
								year: 'numeric'
							})}
							onclick={() => ondate(date)}>{Number(date.slice(8))}</button
						>{#if onadd}<AddEventButton {date} {onadd} />{/if}
					</div>
				</div>
				{@const hidden = week.segments.filter(
					(s) => s.start <= col && s.end >= col && s.lane >= limit
				).length}
				{#if hidden > 0}<button
						class="month-more"
						style:grid-column={col + 1}
						style:grid-row={week.lanes + 2}
						aria-expanded={week.expanded}
						aria-label={`${week.expanded ? 'Collapse' : 'Expand'} events for ${date}`}
						onclick={() => (expandedDate = week.expanded ? null : date)}
						>{week.expanded ? 'Less' : `+${hidden} more`}</button
					>{/if}
			{/each}
			{#each week.segments.filter((s) => s.lane < week.lanes) as segment (segment.event.id)}
				{@const event = segment.event}
				{@const range = eventDates(event, timeZone)}
				<button
					class="month-event"
					class:all-day={event.kind === 'all-day'}
					class:multi-day={range.first !== range.last}
					class:continues-before={segment.continuesBefore}
					class:continues-after={segment.continuesAfter}
					style:grid-column={`${segment.start + 1} / ${segment.end + 2}`}
					style:grid-row={segment.lane + 2}
					style:--calendar-color={calendars.find((c) => c.id === event.calendarId)?.color}
					aria-label={`${event.title}, ${range.first}${range.last !== range.first ? ` to ${range.last}` : ''}, ${event.kind === 'all-day' ? 'All day' : dayTime(event, week.days[segment.start], timeZone).summary}`}
					title={event.title}
					onclick={() => onopen(event)}
				>
					{#if segment.continuesBefore}<span class="span-edge" aria-hidden="true">‹</span>{/if}
					<span class="month-event-title"
						>{event.kind === 'timed'
							? `${dayTime(event, week.days[segment.start], timeZone).primary === 'Until' ? dayTime(event, week.days[segment.start], timeZone).summary : dayTime(event, week.days[segment.start], timeZone).primary} `
							: ''}{event.title}</span
					>
					{#if segment.continuesAfter}<span class="span-edge" aria-hidden="true">›</span>{/if}
				</button>
			{/each}
		</section>
	{/each}
</div>

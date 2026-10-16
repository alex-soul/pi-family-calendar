<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { addDays, dateLabel, dateKey, timeLabel } from '../dates.ts';
	import { scheduleFocusIndex } from '../display.ts';
	import { followCurrent } from '../follow-current.ts';
	let {
		index,
		from,
		to,
		today,
		now,
		calendars,
		timeZone,
		token,
		onopen
	}: {
		index: Map<string, CalendarEvent[]>;
		from: string;
		to: string;
		today: string;
		now: Date;
		calendars: Calendar[];
		timeZone: string;
		token: number;
		onopen: (e: CalendarEvent) => void;
	} = $props();
	let rows = $derived.by(() => {
		const result: { date: string; event: CalendarEvent }[] = [];
		for (let date = from; date < to; date = addDays(date, 1))
			for (const event of index.get(date) || []) result.push({ date, event });
		return result;
	});
	let focus = $derived(scheduleFocusIndex(rows, today, now));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling for the schedule.) -->
<div
	class="schedule-scroll scroll-area"
	role="region"
	aria-label="Schedule events"
	tabindex="0"
	use:followCurrent={token}
>
	{#each rows as row, i (`${row.date}:${row.event.id}`)}
		{@const event = row.event}
		<button
			class="schedule-row"
			class:new-day={i === 0 || rows[i - 1].date !== row.date}
			class:past={row.date < today ||
				(event.kind === 'timed' && Date.parse(event.end) <= now.getTime())}
			data-current={i === focus}
			style:--calendar-color={calendars.find((c) => c.id === event.calendarId)?.color}
			onclick={() => onopen(event)}
		>
			<span
				class="schedule-date"
				class:date-muted={i > 0 && rows[i - 1].date === row.date}
				class:today={row.date === today}
			>
				<strong>{dateLabel(row.date, { day: 'numeric' })}</strong><small
					>{dateLabel(row.date, { month: 'short', weekday: 'short' })}</small
				>
			</span>
			<span class="schedule-time"
				>{#if event.kind === 'all-day'}All day{:else}{dateKey(event.start, timeZone) < row.date
						? 'Until'
						: timeLabel(event.start, timeZone)}{dateKey(event.start, timeZone) < row.date
						? ' '
						: ' – '}{dateKey(event.end, timeZone) > row.date
						? '…'
						: timeLabel(event.end, timeZone)}{/if}</span
			>
			<span class="schedule-copy"
				><strong>{event.title}</strong>{#if event.description}<span>{event.description}</span
					>{/if}</span
			>
		</button>
	{/each}
	<div class="schedule-end" data-current={focus === rows.length}>
		No upcoming events in this range
	</div>
	<div class="scroll-tail" aria-hidden="true"></div>
</div>

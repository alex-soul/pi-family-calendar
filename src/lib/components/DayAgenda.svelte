<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { dateLabel, isPast } from '../dates.ts';
	import EventCard from './EventCard.svelte';
	let {
		date,
		today,
		events,
		calendars,
		timeZone,
		now,
		onopen,
		dense = false
	}: {
		date: string;
		today: string;
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		now: Date;
		onopen: (event: CalendarEvent) => void;
		dense?: boolean;
	} = $props();
	let earlier = $derived(events.filter((event) => isPast(event, date, now, timeZone)));
	let current = $derived(events.filter((event) => !isPast(event, date, now, timeZone)));
	let allDay = $derived(current.filter((event) => event.kind === 'all-day'));
	let timed = $derived(current.filter((event) => event.kind === 'timed'));
</script>

<section class="day-agenda" class:dense>
	<header class="day-heading">
		<h2>{date === today ? 'Today' : dateLabel(date, { weekday: 'long' })}</h2>
		<span>{dateLabel(date, { day: 'numeric', month: 'short' })}</span>
	</header>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions must support keyboard scrolling.) -->
	<div
		class="agenda-scroll scroll-area"
		role="region"
		tabindex="0"
		aria-label={`${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })} events`}
	>
		{#if allDay.length}
			<details class="all-day-summary">
				<summary
					><span>All day</span><span class="summary-preview">{allDay[0].title}</span><span
						class="pill">{allDay.length}</span
					></summary
				>
				<div class="card-stack">
					{#each allDay as event (event.id)}<EventCard
							{event}
							calendar={calendars.find((c) => c.id === event.calendarId)}
							{timeZone}
							{now}
							{onopen}
							compact
						/>{/each}
				</div>
			</details>
		{/if}
		{#if earlier.length}
			<details class="earlier">
				<summary>Earlier <span class="pill">{earlier.length}</span></summary>
				<div class="card-stack">
					{#each earlier as event (event.id)}<EventCard
							{event}
							calendar={calendars.find((c) => c.id === event.calendarId)}
							{timeZone}
							{now}
							{onopen}
						/>{/each}
				</div>
			</details>
		{/if}
		<div class="card-stack">
			{#each timed as event (event.id)}<EventCard
					{event}
					calendar={calendars.find((c) => c.id === event.calendarId)}
					{timeZone}
					{now}
					{onopen}
				/>{/each}
		</div>
		{#if !timed.length}<div class="empty-state">
				<span class="empty-mark">—</span>
				<p>{earlier.length ? 'Nothing else scheduled' : 'No timed events'}</p>
				<small>For the calendars shown</small>
			</div>{/if}
	</div>
</section>

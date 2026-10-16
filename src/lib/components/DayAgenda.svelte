<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { dateLabel, isPast } from '../dates.ts';
	import { agendaFocusIndex } from '../display.ts';
	import { isBannerEvent } from '../month.ts';
	import { followCurrent } from '../follow-current.ts';
	import EventCard from './EventCard.svelte';
	import AllDayStrip from './AllDayStrip.svelte';
	import type { Snippet } from 'svelte';
	let {
		date,
		today,
		events,
		calendars,
		timeZone,
		now,
		onopen,
		dense = false,
		controls,
		token,
		resetToken
	}: {
		date: string;
		today: string;
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		now: Date;
		onopen: (event: CalendarEvent) => void;
		dense?: boolean;
		controls?: Snippet;
		token: number;
		resetToken: number;
	} = $props();
	let timed = $derived(events.filter((e) => !isBannerEvent(e, timeZone)));
	let focus = $derived(date === today ? agendaFocusIndex(timed, now) : 0);
</script>

<section class="day-agenda" class:dense>
	<header class="day-heading">
		<div class="day-title">
			<h2>{dateLabel(date, { weekday: dense ? 'short' : 'long' })}</h2>
			<span>{dateLabel(date, { day: 'numeric', month: 'short' })}</span>
		</div>
		{#if controls}{@render controls()}{/if}
	</header>
	<AllDayStrip {resetToken} {events} {calendars} {onopen} dates={[date]} {timeZone} />
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling for the agenda.) -->
	<div
		class="agenda-scroll scroll-area"
		role="region"
		tabindex="0"
		aria-label={`${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })} events`}
		use:followCurrent={token}
	>
		<div class="card-stack">
			{#each timed as event, i (event.id)}
				<div data-current={i === focus} class:past={isPast(event, date, now, timeZone)}>
					<EventCard
						{date}
						{event}
						calendar={calendars.find((c) => c.id === event.calendarId)}
						{timeZone}
						{now}
						{onopen}
					/>
				</div>
			{/each}
		</div>
		{#if timed.length && date === today && focus === timed.length}<div
				class="empty-state"
				data-current="true"
			>
				<p>Nothing else scheduled</p>
			</div>{/if}
		<div class="scroll-tail" aria-hidden="true"></div>
	</div>
</section>

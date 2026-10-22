<script lang="ts">
	import { getContext } from 'svelte';
	import type { EventVisibility } from '../event-visibility.ts';
	import HiddenEventsBubble from './HiddenEventsBubble.svelte';
	const visibility = getContext<EventVisibility>('eventVisibility');
	import type { Calendar, CalendarEvent, Reminder } from '../domain.ts';
	import { dateLabel, isPast } from '../dates.ts';
	import ReminderBubble from './ReminderBubble.svelte';
	import { remindersForDay, orderReminders } from '../display.ts';
	import { agendaFocusIndex } from '../display.ts';
	import { isBannerEvent } from '../month.ts';
	import { followCurrent } from '../follow-current.ts';
	import EventCard from './EventCard.svelte';
	import AllDayStrip from './AllDayStrip.svelte';
	import type { Snippet } from 'svelte';
	let {
		date,
		today,
		reminders,
		events,
		calendars,
		timeZone,
		now,
		onopen,
		ondate,
		dense = false,
		controls,
		token,
		resetToken,
		initialScroll
	}: {
		date: string;
		today: string;
		reminders: Reminder[];
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		now: Date;
		onopen: (event: CalendarEvent) => void;
		ondate?: (date: string) => void;
		dense?: boolean;
		controls?: Snippet;
		token: number;
		resetToken: number;
		initialScroll?: number;
	} = $props();
	let items = $derived(orderReminders(remindersForDay(reminders, date, today).items));
	let timed = $derived(
		events.filter((e) => !isBannerEvent(e, timeZone) && !visibility.hidden(e, date))
	);
	let focus = $derived(date === today ? agendaFocusIndex(timed, now) : 0);
</script>

<section class="day-agenda" class:dense>
	<header class="day-heading">
		<div class="day-title">
			{#if ondate}<button
					class="day-date-link"
					aria-label={`Show ${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
					onclick={() => ondate?.(date)}>{@render dateHeading()}</button
				>
			{:else}{@render dateHeading()}{/if}
			{#if items.length || visibility.forDate(events, date).length}<div class="day-heading-actions">
					{#if items.length}<ReminderBubble
							{timeZone}
							{date}
							{items}
							{today}
							inline
						/>{/if}<HiddenEventsBubble {date} {events} />
				</div>{/if}
		</div>
		{#if controls}{@render controls()}{/if}
	</header>
	<AllDayStrip {resetToken} {events} {calendars} {onopen} dates={[date]} {timeZone} />
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling for the agenda.) -->
	<div
		class="agenda-scroll scroll-area"
		data-scroll-date={date}
		role="region"
		tabindex="0"
		aria-label={`${dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' })} events`}
		use:followCurrent={{ token, initialScroll }}
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
				class="agenda-end"
				aria-hidden="true"
				data-current="true"
			></div>{/if}
		<div class="scroll-tail" aria-hidden="true"></div>
	</div>
</section>

{#snippet dateHeading()}<h2>{dateLabel(date, { weekday: 'long' })}</h2>
	<span>{dateLabel(date, { day: 'numeric', month: 'short' })}</span>{/snippet}

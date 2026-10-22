<script lang="ts">
	import { getContext } from 'svelte';
	import type { EventVisibility } from '../event-visibility.ts';
	import HiddenEventsBubble from './HiddenEventsBubble.svelte';
	const visibility = getContext<EventVisibility>('eventVisibility');
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { isOngoing, dateKey } from '../dates.ts';
	import { dayTime } from '../month.ts';
	let {
		event,
		date,
		calendar,
		timeZone,
		now,
		compact = false,
		onopen
	}: {
		event: CalendarEvent;
		date: string;
		calendar?: Calendar;
		timeZone: string;
		now: Date;
		compact?: boolean;
		onopen: (event: CalendarEvent) => void;
	} = $props();
	let labels = $derived(dayTime(event, date, timeZone));
</script>

<button
	class="event-card"
	class:compact
	class:ongoing={date === dateKey(now, timeZone) && isOngoing(event, now)}
	style:--calendar-color={calendar?.color || '#7b9b80'}
	onclick={() => visibility.open(event, date)}
>
	<span class="event-time" class:word-time={labels.primary === 'All day'}
		>{labels.primary}
		{#if labels.secondary && (!compact || labels.primary === 'Until' || labels.secondary === 'Continues')}<small
				class:clock-time={/^\d{2}:\d{2}$/.test(labels.secondary)}>{labels.secondary}</small
			>{/if}
	</span>
	<span class="event-copy"
		><strong>{event.title}</strong>
		{#if event.description}<span class="event-description">{event.description}</span>{/if}
		{#if date === dateKey(now, timeZone) && isOngoing(event, now)}<span class="now-label">Now</span
			>{/if}</span
	>
</button>

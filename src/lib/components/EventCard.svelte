<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { isOngoing, timeLabel } from '../dates.ts';
	let {
		event,
		calendar,
		timeZone,
		now,
		compact = false,
		onopen
	}: {
		event: CalendarEvent;
		calendar?: Calendar;
		timeZone: string;
		now: Date;
		compact?: boolean;
		onopen: (event: CalendarEvent) => void;
	} = $props();
</script>

<button
	class="event-card"
	class:compact
	class:ongoing={isOngoing(event, now)}
	style:--calendar-color={calendar?.color || '#7b9b80'}
	onclick={() => onopen(event)}
>
	<span class="event-time"
		>{event.kind === 'all-day' ? 'All day' : timeLabel(event.start, timeZone)}
		{#if event.kind === 'timed' && !compact}<small>{timeLabel(event.end, timeZone)}</small>{/if}
	</span>
	<span class="event-copy"
		><strong>{event.title}</strong><span class="event-meta"
			>{calendar?.name || 'Calendar'}{#if isOngoing(event, now)}<span class="now-label">Now</span
				>{/if}</span
		></span
	>
</button>

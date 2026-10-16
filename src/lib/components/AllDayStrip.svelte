<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	let {
		events,
		calendars,
		onopen
	}: { events: CalendarEvent[]; calendars: Calendar[]; onopen: (e: CalendarEvent) => void } =
		$props();
	let expanded = $state(false);
	let allDay = $derived(events.filter((e) => e.kind === 'all-day'));
</script>

{#if allDay.length}
	<section class="all-day-strip" aria-label="All-day events">
		<div class="all-day-stack">
			{#each expanded ? allDay : allDay.slice(0, 3) as event (event.id)}
				<button
					class="all-day-card"
					style:--calendar-color={calendars.find((c) => c.id === event.calendarId)?.color ||
						'#7b9b80'}
					onclick={() => onopen(event)}
					title={event.title}><span>{event.title}</span></button
				>
			{/each}
		</div>
		{#if allDay.length > 3}<button
				class="all-day-more"
				aria-expanded={expanded}
				aria-label={expanded
					? 'Collapse all-day events'
					: `Show ${allDay.length - 3} more all-day events`}
				onclick={() => (expanded = !expanded)}
				>{expanded ? '−' : `+${allDay.length - 3}`}<span class="small-chevron"
					>{expanded ? '⌃' : '⌄'}</span
				></button
			>{/if}
	</section>
{/if}

<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	let {
		events,
		calendars,
		onopen,
		resetToken
	}: {
		events: CalendarEvent[];
		calendars: Calendar[];
		onopen: (e: CalendarEvent) => void;
		resetToken: number;
	} = $props();
	let expanded = $state(false);
	let startY: number | null = null;
	let dragged = false;
	$effect(() => {
		resetToken;
		expanded = false;
	});
	function dragStart(e: PointerEvent) {
		startY = e.clientY;
		dragged = false;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function dragMove(e: PointerEvent) {
		if (startY === null || Math.abs(e.clientY - startY) < 16) return;
		expanded = e.clientY > startY;
		dragged = true;
	}
	function dragEnd() {
		startY = null;
	}
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
				aria-label={expanded ? 'Collapse all-day events' : 'Expand all-day events'}
				onpointerdown={dragStart}
				onpointermove={dragMove}
				onpointerup={dragEnd}
				onpointercancel={() => {
					dragEnd();
					dragged = true;
				}}
				onclick={(e) => {
					if (!dragged || e.detail === 0) expanded = !expanded;
					dragged = false;
				}}><span class="divider-grip"></span></button
			>{/if}
	</section>
{/if}

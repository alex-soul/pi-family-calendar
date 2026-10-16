<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { isBannerEvent, monthWeek, bannerTime } from '../month.ts';
	let {
		events,
		dates,
		timeZone,
		calendars,
		onopen,
		resetToken
	}: {
		events: CalendarEvent[];
		dates: string[];
		timeZone: string;
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
	let segments = $derived(
		monthWeek(
			events.filter((e) => isBannerEvent(e, timeZone)),
			dates,
			timeZone
		)
	);
	let lanes = $derived(Math.max(0, ...segments.map((s) => s.lane + 1)));
	let rangeKey = $derived(dates.join('|'));
	$effect(() => {
		rangeKey;
		expanded = false;
	});
</script>

{#if segments.length}
	<section
		class="all-day-strip"
		class:week-strip={dates.length > 1}
		aria-label="All-day and multi-day events"
	>
		<div
			class="all-day-stack banner-grid"
			style:grid-template-columns={`repeat(${dates.length},minmax(0,1fr))`}
		>
			{#each segments.filter((s) => expanded || s.lane < 3) as segment (segment.event.id)}
				{@const event = segment.event}
				{@const label = bannerTime(event, dates[segment.start], timeZone)}
				<button
					class="all-day-card"
					class:continues-before={segment.continuesBefore}
					class:continues-after={segment.continuesAfter}
					style:grid-column={`${segment.start + 1} / ${segment.end + 2}`}
					style:grid-row={segment.lane + 1}
					style:--calendar-color={calendars.find((c) => c.id === event.calendarId)?.color ||
						'#7b9b80'}
					onclick={() => onopen(event)}
					title={event.title}
					aria-label={`${event.title}${label ? `, ${label}` : ''}`}
				>
					{#if segment.continuesBefore}<span class="banner-edge" aria-hidden="true">‹</span>{/if}
					<span class="banner-title"
						>{event.title}{#if label}<span class="banner-time">, {label}</span>{/if}</span
					>
					{#if segment.continuesAfter}<span class="banner-edge" aria-hidden="true">›</span>{/if}
				</button>
			{/each}
		</div>
		{#if lanes > 3}<button
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

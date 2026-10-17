<script lang="ts">
	import type { Calendar, CalendarEvent } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import AllDayStrip from './AllDayStrip.svelte';
	let {
		dates,
		events,
		calendars,
		timeZone,
		resetToken,
		ondate,
		onopen,
		onadd
	}: {
		dates: string[];
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		resetToken: number;
		ondate: (date: string) => void;
		onopen: (event: CalendarEvent) => void;
		onadd?: (first: string, last: string) => void;
	} = $props();
	let surface: HTMLDivElement;
	let start = $state('');
	let end = $state('');
	let pointer: number | null = null;
	const first = $derived(start < end ? start : end);
	const last = $derived(start > end ? start : end);
	function cancel() {
		start = end = '';
		pointer = null;
	}
	function begin(event: PointerEvent, date: string) {
		if (!onadd || !event.isPrimary || event.button !== 0) return;
		start = end = date;
		pointer = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(pointer);
	}
	function move(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		const rect = surface.getBoundingClientRect();
		if (
			event.clientX >= rect.left &&
			event.clientX < rect.right &&
			event.clientY >= rect.top &&
			event.clientY < rect.bottom
		) {
			end = dates[Math.floor(((event.clientX - rect.left) / rect.width) * dates.length)];
		}
	}
	function finish(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		move(event);
		const rect = surface.getBoundingClientRect();
		if (
			event.clientX >= rect.left &&
			event.clientX < rect.right &&
			event.clientY >= rect.top &&
			event.clientY < rect.bottom
		)
			onadd?.(first, last);
		cancel();
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') cancel();
	}}
/>

<div class="week-create-header" bind:this={surface!}>
	{#if onadd}
		<div class="week-create-targets">
			{#each dates as date}
				<button
					class="week-create-target"
					class:range-selected={!!start && date >= first && date <= last}
					aria-label={`Add all-day event on ${dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}`}
					onpointerdown={(event) => begin(event, date)}
					onpointermove={move}
					onpointerup={finish}
					onpointercancel={cancel}
					onlostpointercapture={cancel}
					onclick={(event) => {
						if (event.detail === 0) onadd?.(date, date);
					}}
				></button>
			{/each}
		</div>
	{/if}
	<div class="week-headings">
		{#each dates as date}
			<button
				class="week-heading"
				aria-label={dateLabel(date, {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})}
				onclick={() => ondate(date)}
			>
				<strong>{dateLabel(date, { day: 'numeric' })}</strong><span
					>{dateLabel(date, { weekday: 'short' })}</span
				>
			</button>
		{/each}
	</div>
	<AllDayStrip {dates} {events} {calendars} {timeZone} {resetToken} {onopen} />
</div>

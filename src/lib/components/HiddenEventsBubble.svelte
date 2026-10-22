<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarEvent } from '../domain.ts';
	import type { EventVisibility } from '../event-visibility.ts';
	import { dateLabel } from '../dates.ts';
	import { dayTime } from '../month.ts';
	import { plainDescription } from '../description.ts';
	import Icon from './Icon.svelte';
	let { date, events }: { date: string; events: CalendarEvent[] } = $props();
	const visibility = getContext<EventVisibility>('eventVisibility');
	let items = $derived(visibility.forDate(events, date));
	let bubble = $state<HTMLDivElement>();
	let open = $state(false),
		x = $state(0),
		y = $state(0);
	const id = $props.id();
	function toggle(e: MouseEvent) {
		if (bubble!.matches(':popover-open')) {
			bubble!.hidePopover();
			return;
		}
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		x = Math.max(8, Math.min(r.right - 340, window.innerWidth - 348));
		y = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 388));
		bubble!.showPopover();
	}
</script>

<svelte:window onresize={() => bubble?.hidePopover()} />

{#if items.length}<button
		class="date-icon-trigger"
		aria-label={`Hidden events for ${date}`}
		aria-haspopup="dialog"
		aria-controls={id}
		aria-expanded={open}
		onclick={toggle}><Icon name="eye" size={18} /></button
	>
	<div
		bind:this={bubble!}
		{id}
		popover="auto"
		role="dialog"
		aria-label={`Hidden events for ${date}`}
		class="hidden-event-bubble"
		style:left={`${x}px`}
		style:top={`${y}px`}
		ontoggle={(e) => (open = e.newState === 'open')}
	>
		<header>
			<h3>{dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
			<button
				class="icon-button"
				aria-label="Close hidden events"
				onclick={() => bubble!.hidePopover()}><Icon name="close" size={18} /></button
			>
		</header>
		{#each items as event (event.id)}
			{@const calendar = visibility.calendar(event)}
			<button
				type="button"
				class="hidden-event-item"
				style:--event-color={calendar?.color || 'var(--accent)'}
				aria-label={`Open hidden event: ${event.title}`}
				onclick={() => {
					bubble!.hidePopover();
					visibility.open(event, date);
				}}
			>
				<span class="hidden-event-copy">
					<span class="hidden-event-time"
						>{dayTime(event, date, visibility.timeZone()).summary}</span
					>
					<strong>{event.title}</strong>
					{#if calendar}<span class="hidden-event-calendar">{calendar.name}</span>{/if}
					{#if event.location}<span class="hidden-event-location"
							><Icon name="location" size={14} />{event.location}</span
						>
					{:else if event.description}<span class="hidden-event-description"
							>{plainDescription(event.description)}</span
						>{/if}
				</span>
				<Icon name="right" size={18} />
			</button>{/each}
	</div>{/if}

<style>
	.hidden-event-bubble {
		position: fixed;
		margin: 0;
		width: 340px;
		max-width: calc(100vw - 16px);
		max-height: min(380px, calc(100dvh - 16px));
		padding: 14px;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--line);
		border-radius: 16px;
		box-shadow: 0 14px 45px #0008;
		overflow: auto;
		pointer-events: auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	h3 {
		font-size: 17px;
		margin: 0;
	}
	.hidden-event-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		text-align: left;
		padding: 14px;
		margin-top: 8px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--line);
		border-left: 4px solid var(--event-color);
		border-radius: 12px;
	}
	.hidden-event-item:hover {
		background: var(--accent-soft);
	}
	.hidden-event-copy {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.hidden-event-copy strong {
		font-size: 18px;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.hidden-event-time {
		font-size: 15px;
		font-weight: 600;
	}
	.hidden-event-calendar {
		font-size: 12px;
		color: var(--muted);
	}
	.hidden-event-location {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		color: var(--muted);
	}
	.hidden-event-description {
		font-size: 13px;
		line-height: 1.4;
		color: var(--muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>

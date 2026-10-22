<script lang="ts">
	import { getContext } from 'svelte';
	import type { CalendarEvent } from '../domain.ts';
	import type { EventVisibility } from '../event-visibility.ts';
	import { dateLabel } from '../dates.ts';
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
		y = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 328));
		bubble!.showPopover();
	}
</script>

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
		{#each items as event (event.id)}<button
				class="hidden-event-item"
				onclick={() => {
					bubble!.hidePopover();
					visibility.open(event, date);
				}}>{event.title}</button
			>{/each}
	</div>{/if}

<style>
	.hidden-event-bubble {
		position: fixed;
		margin: 0;
		width: 340px;
		max-width: calc(100vw - 16px);
		max-height: 320px;
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
	}
	h3 {
		font-size: 17px;
		margin: 0;
	}
	.hidden-event-item {
		width: 100%;
		text-align: left;
		padding: 12px 6px;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--line);
	}
</style>

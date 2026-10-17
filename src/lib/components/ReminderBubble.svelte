<script lang="ts">
	import type { Reminder } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import Icon from './Icon.svelte';
	import ReminderSummary from './ReminderSummary.svelte';
	let {
		date,
		items,
		today,
		inline = false
	}: { date: string; items: Reminder[]; today: string; inline?: boolean } = $props();
	let bubble: HTMLDivElement;
	let x = $state(0),
		y = $state(0),
		open = $state(false);
	const id = $props.id();
	function toggle(event: MouseEvent) {
		if (bubble.matches(':popover-open')) {
			bubble.hidePopover();
			return;
		}
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		x = Math.max(8, Math.min(rect.right - 340, window.innerWidth - 348));
		y = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 328));
		bubble.showPopover();
	}
</script>

<svelte:window onresize={() => bubble?.hidePopover()} />

<button
	class="reminder-trigger"
	class:inline
	aria-label={`Reminders for ${date}`}
	aria-haspopup="dialog"
	aria-controls={id}
	aria-expanded={open}
	onclick={toggle}><Icon name="list" size={18} /></button
>
<div
	bind:this={bubble!}
	{id}
	popover="auto"
	role="dialog"
	aria-label={`Reminders for ${date}`}
	class="reminder-bubble"
	style:left={`${x}px`}
	style:top={`${y}px`}
	ontoggle={(event) => (open = event.newState === 'open')}
>
	<header>
		<h3>{dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
		<button class="icon-button" aria-label="Close reminders" onclick={() => bubble.hidePopover()}
			><Icon name="close" size={18} /></button
		>
	</header>
	<div class="history-items">
		{#each items as reminder (reminder.id)}<ReminderSummary {reminder} {today} />{/each}
	</div>
</div>

<style>
	.reminder-trigger {
		padding: 4px 6px;
		min-height: 26px;
		border: 0;
		background: transparent;
		color: var(--accent);
		border-radius: 8px;
	}
	.reminder-trigger.inline {
		display: inline-flex;
		padding: 0 4px;
		min-height: 24px;
		align-items: center;
		transform: translateY(3px);
		pointer-events: auto;
	}
	.reminder-trigger:hover {
		background: var(--accent-soft);
	}
	.reminder-bubble {
		position: fixed;
		margin: 0;
		width: 340px;
		max-width: calc(100vw - 16px);
		max-height: min(320px, calc(100dvh - 16px));
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--panel);
		color: var(--text);
		box-shadow: 0 14px 45px #0008;
		overflow: auto;
		pointer-events: auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	h3 {
		margin: 0;
		font-size: 17px;
	}
	.history-items {
		display: grid;
		gap: 13px;
	}
</style>

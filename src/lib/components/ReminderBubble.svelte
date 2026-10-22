<script lang="ts">
	import { getContext } from 'svelte';
	import { localTime } from '../reminder-time.ts';
	import type { Reminder } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import Icon from './Icon.svelte';
	import ReminderSummary from './ReminderSummary.svelte';
	let {
		date,
		items,
		today,
		timeZone,
		inline = false
	}: {
		date: string;
		items: Reminder[];
		today: string;
		timeZone: string;
		inline?: boolean;
	} = $props();
	let time = $state('00:00');
	const openReminder = getContext<(reminder: Reminder) => void>('openReminder');
	let bubble: HTMLDivElement;
	let x = $state(0),
		y = $state(0),
		open = $state(false);
	const id = $props.id();
	function toggle(event: MouseEvent) {
		time = localTime(new Date(), timeZone);
		if (bubble.matches(':popover-open')) {
			bubble.hidePopover();
			return;
		}
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		x = Math.max(8, Math.min(rect.right - 340, window.innerWidth - 348));
		bubble.showPopover();
		y = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - bubble.offsetHeight - 8));
	}
</script>

<svelte:window onresize={() => bubble?.hidePopover()} />

<button
	class="reminder-trigger date-icon-trigger"
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
		{#each items as reminder (reminder.id)}
			<button
				type="button"
				class="reminder-bubble-item"
				aria-label={`Open ${reminder.title}`}
				onclick={() => {
					bubble.hidePopover();
					openReminder(reminder);
				}}><ReminderSummary {reminder} {today} {time} /></button
			>
		{/each}
	</div>
</div>

<style>
	.reminder-trigger:hover {
		background: var(--accent-soft);
	}
	.reminder-bubble {
		position: fixed;
		inset: auto;
		margin: 0;
		width: 340px;
		max-width: calc(100vw - 16px);
		max-height: calc(100dvh - 16px);
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
		gap: 8px;
	}
	.reminder-bubble-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
	}
	.reminder-bubble-item:hover {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
</style>

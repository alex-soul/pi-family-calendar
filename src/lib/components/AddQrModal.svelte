<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from './Modal.svelte';
	import EventQr from './EventQr.svelte';
	import ReminderQr from './ReminderQr.svelte';
	let {
		initialKind,
		date,
		endDate,
		allDay,
		reminderDate,
		eventEnabled,
		reminderEnabled,
		onclose
	}: {
		initialKind: 'event' | 'reminder';
		date: string;
		endDate?: string;
		allDay: boolean;
		reminderDate: string | null;
		eventEnabled: boolean;
		reminderEnabled: boolean;
		onclose: () => void;
	} = $props();
	let kind = $state(untrack(() => initialKind));
	let seenEvent = $state(false),
		seenReminder = $state(false);
	let allowReminder = $derived(reminderEnabled && (!endDate || endDate === date));
	$effect(() => {
		if (!eventEnabled && !allowReminder) {
			onclose();
			return;
		}
		if (kind === 'event' && !eventEnabled) kind = 'reminder';
		if (kind === 'reminder' && !allowReminder) kind = 'event';
		if (kind === 'event') seenEvent = true;
		else seenReminder = true;
	});
</script>

<Modal title={kind === 'event' ? 'Add event' : 'Add reminder'} {onclose}>
	{#snippet heading()}
		{#if eventEnabled && allowReminder}
			<div class="add-kind" role="group" aria-label="What to add">
				<button
					class:active={kind === 'event'}
					aria-pressed={kind === 'event'}
					onclick={() => (kind = 'event')}>Event</button
				>
				<button
					class:active={kind === 'reminder'}
					aria-pressed={kind === 'reminder'}
					onclick={() => (kind = 'reminder')}>Reminder</button
				>
			</div>
		{:else}<h2>{kind === 'event' ? 'Add event' : 'Add reminder'}</h2>{/if}
	{/snippet}
	<div class="add-qr-body">
		{#if seenEvent && eventEnabled}<div hidden={kind !== 'event'}>
				<EventQr {date} {endDate} {allDay} />
			</div>{/if}
		{#if seenReminder && allowReminder}<div hidden={kind !== 'reminder'}>
				<ReminderQr defaultDate={reminderDate} />
			</div>{/if}
	</div>
</Modal>

<style>
	.add-kind {
		display: flex;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.add-kind button {
		min-height: 40px;
		padding: 6px 18px;
		border: 0;
		background: transparent;
		border-radius: 9px;
	}
	.add-kind button.active {
		background: var(--accent-soft);
		color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.add-qr-body {
		min-height: 280px;
	}
</style>

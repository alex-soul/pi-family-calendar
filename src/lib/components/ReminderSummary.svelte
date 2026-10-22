<script lang="ts">
	import CategoryBadge from './CategoryBadge.svelte';
	import type { Reminder } from '../domain.ts';
	import { reminderStatus } from '../recurrence.ts';
	import { reminderTimeLabel, isReminderOverdue } from '../reminder-time.ts';
	import Icon from './Icon.svelte';
	let {
		reminder,
		today,
		time = '00:00'
	}: { reminder: Reminder; today: string; time?: string } = $props();
</script>

<div
	class="reminder-summary"
	class:resolved={!!reminder.completedAt}
	class:unfinished={isReminderOverdue(reminder, today, time)}
	class:past-note={reminder.kind === 'note' && !!reminder.dueDate && reminder.dueDate < today}
>
	<span
		class="history-symbol"
		role="img"
		aria-label={reminderStatus(reminder, today, time)}
		title={reminderStatus(reminder, today, time)}
		><Icon
			name={reminder.kind === 'note' ? 'note' : reminder.completedAt ? 'check' : 'square'}
			size={17}
		/></span
	>
	<div>
		<strong>{reminder.title}</strong>{#if reminder.repeat}<span class="repeat-marker"
				><Icon name="repeat" size={14} /></span
			>{/if}
		<CategoryBadge category={reminder.category} />
		{#if reminderTimeLabel(reminder)}<p>{reminderTimeLabel(reminder)}</p>{/if}
		{#if reminder.notes}<p>{reminder.notes}</p>{/if}
	</div>
</div>

<style>
	.reminder-summary {
		display: flex;
		gap: 8px;
		min-width: 0;
		align-items: baseline;
		text-align: left;
	}
	.history-symbol {
		flex: none;
		align-self: flex-start;
		color: var(--accent);
		padding-top: 2px;
	}
	.reminder-summary > div {
		min-width: 0;
	}
	strong {
		overflow-wrap: anywhere;
	}
	p {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.resolved {
		opacity: 0.65;
	}
	.unfinished,
	.unfinished .history-symbol {
		color: var(--danger);
	}
	.past-note,
	.past-note .history-symbol {
		color: var(--muted);
	}
	.past-note {
		opacity: 0.6;
	}
</style>

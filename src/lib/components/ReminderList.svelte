<script lang="ts">
	import type { Reminder } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import Icon from './Icon.svelte';
	let {
		reminders,
		today,
		busy,
		ontoggle,
		onopen
	}: {
		reminders: Reminder[];
		today: string;
		busy: string | null;
		ontoggle: (r: Reminder) => void;
		onopen: (r: Reminder) => void;
	} = $props();
</script>

<div class="reminder-list">
	{#each reminders as reminder (reminder.id)}
		<div class="reminder-row" class:completed={!!reminder.completedAt}>
			<button
				class="reminder-check"
				disabled={!!busy}
				onclick={() => ontoggle(reminder)}
				aria-label={`${reminder.completedAt ? 'Undo' : 'Complete'} ${reminder.title}`}
				aria-pressed={!!reminder.completedAt}
			>
				<span class="checkbox"
					>{#if reminder.completedAt}<Icon name="check" size={18} />{/if}</span
				>
			</button>
			<button
				class="reminder-copy"
				onclick={() => onopen(reminder)}
				aria-label={`Open ${reminder.title}`}
			>
				<strong>{reminder.title}</strong>
				{#if reminder.notes}<span class="event-description">{reminder.notes}</span>{/if}
				{#if reminder.dueDate && reminder.dueDate !== today}
					<small class:overdue={!reminder.completedAt && reminder.dueDate < today}>
						{dateLabel(reminder.dueDate, { day: 'numeric', month: 'short' })}{reminder.dueDate <
							today && !reminder.completedAt
							? ' · Overdue'
							: ''}
					</small>
				{/if}
			</button>
		</div>
	{/each}
</div>

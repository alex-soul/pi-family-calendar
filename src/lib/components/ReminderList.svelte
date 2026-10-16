<script lang="ts">
	import type { Reminder } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import Icon from './Icon.svelte';
	let {
		reminders,
		today,
		busy,
		ontoggle
	}: {
		reminders: Reminder[];
		today: string;
		busy: string | null;
		ontoggle: (r: Reminder) => void;
	} = $props();
</script>

<div class="reminder-list">
	{#each reminders as reminder (reminder.id)}
		<button
			class="reminder-row"
			class:completed={!!reminder.completedAt}
			disabled={busy === reminder.id}
			onclick={() => ontoggle(reminder)}
			aria-label={`${reminder.completedAt ? 'Undo' : 'Complete'} ${reminder.title}`}
		>
			<span class="checkbox"
				>{#if reminder.completedAt}<Icon name="check" size={18} />{/if}</span
			>
			<span class="reminder-copy"
				><strong>{reminder.title}</strong><small
					>{reminder.list}{#if reminder.dueDate}<span
							class:overdue={!reminder.completedAt && reminder.dueDate < today}
						>
							· {reminder.dueDate === today
								? 'Today'
								: dateLabel(reminder.dueDate, {
										day: 'numeric',
										month: 'short'
									})}{reminder.dueDate < today && !reminder.completedAt ? ' · Overdue' : ''}</span
						>{/if}</small
				></span
			>
		</button>
	{/each}
</div>

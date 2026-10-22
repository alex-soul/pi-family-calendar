<script lang="ts">
	import CategoryBadge from './CategoryBadge.svelte';
	import type { Reminder } from '../domain.ts';
	import { dateLabel } from '../dates.ts';
	import { reminderTimeLabel, isReminderOverdue } from '../reminder-time.ts';
	import { orderReminders } from '../display.ts';
	import Icon from './Icon.svelte';
	import { repeatLabel } from '../recurrence.ts';
	import { canCompleteReminder } from '../reminder-completion.ts';
	let {
		reminders,
		today,
		time,
		contextDate,
		busy,
		ontoggle,
		onopen
	}: {
		reminders: Reminder[];
		today: string;
		time: string;
		contextDate?: string;
		busy: string | null;
		ontoggle: (r: Reminder) => void;
		onopen: (r: Reminder) => void;
	} = $props();
	let ordered = $derived(orderReminders(reminders));
</script>

<div class="reminder-list">
	{#each ordered as reminder (reminder.id)}
		<div
			class="reminder-row"
			style:border-left-color={reminder.category?.color || undefined}
			class:note-card={reminder.kind === 'note'}
			class:completed={!!reminder.completedAt}
		>
			{#if reminder.kind !== 'note'}<button
					class="reminder-check"
					disabled={!!busy || !!reminder.completedAt || !canCompleteReminder(reminder, today)}
					title={!reminder.completedAt && !canCompleteReminder(reminder, today)
						? 'Available on its scheduled day'
						: undefined}
					onclick={() => ontoggle(reminder)}
					aria-label={`${reminder.completedAt ? 'Completed' : 'Complete'} ${reminder.title}`}
					aria-pressed={!!reminder.completedAt}
				>
					<span class="checkbox"
						>{#if reminder.completedAt}<Icon name="check" size={18} />{/if}</span
					>
				</button>{/if}
			<button
				class="reminder-copy"
				onclick={() => onopen(reminder)}
				aria-label={`Open ${reminder.title}`}
			>
				<strong
					>{reminder.title}{#if reminder.repeat}<span
							class="repeat-marker"
							title={repeatLabel(reminder)}
							aria-label={repeatLabel(reminder)}><Icon name="repeat" size={15} /></span
						>{/if}</strong
				>
				<CategoryBadge category={reminder.category} />
				{#if reminderTimeLabel(reminder)}<small
						class:overdue={isReminderOverdue(reminder, today, time)}
						>{reminderTimeLabel(reminder)}{isReminderOverdue(reminder, today, time) &&
						reminder.dueDate === today
							? ' · Overdue'
							: ''}</small
					>{/if}
				{#if reminder.preview}<small>Preview · repeating template</small>{/if}
				{#if reminder.notes}<span class="event-description">{reminder.notes}</span>{/if}
				{#if reminder.dueDate && reminder.dueDate !== today && reminder.dueDate !== contextDate}
					<small
						class:overdue={reminder.kind !== 'note' &&
							!reminder.completedAt &&
							reminder.dueDate < today}
					>
						{dateLabel(reminder.dueDate, { day: 'numeric', month: 'short' })}{reminder.dueDate <
							today &&
						reminder.kind !== 'note' &&
						!reminder.completedAt
							? ' · Overdue'
							: ''}
					</small>
				{/if}
			</button>
		</div>
	{/each}
</div>

<script lang="ts">
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
		{@const compactTime = reminder.kind === 'note' && !!reminder.showFrom && !!reminder.showUntil}
		<div
			class="reminder-row"
			class:overdue-row={isReminderOverdue(reminder, today, time)}
			style:border-left-color={reminder.category?.color || undefined}
			class:note-card={reminder.kind === 'note'}
			class:categorized-note={reminder.kind === 'note' &&
				!!reminder.category &&
				reminder.category.id !== 'general'}
			class:completed={!!reminder.completedAt}
		>
			{#if reminder.kind !== 'note'}<div class="reminder-control">
					<button
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
					</button>
				</div>{/if}
			<button
				class="reminder-copy"
				onclick={() => onopen(reminder)}
				aria-label={`Open ${reminder.title}${compactTime ? `, timed note ${reminderTimeLabel(reminder)}` : ''}`}
			>
				<span class="reminder-title-row"
					><strong
						>{#if reminder.kind === 'note' && reminder.category?.icon && reminder.category.id !== 'general'}<span
								class="note-title-icon"><Icon name={reminder.category.icon} size={18} /></span
							>{/if}{reminder.title}{#if reminder.repeat}<span
								class="repeat-marker"
								title={repeatLabel(reminder)}
								aria-label={repeatLabel(reminder)}><Icon name="repeat" size={15} /></span
							>{/if}{#if compactTime}<span
								class="note-time-marker"
								title={`Timed note · ${reminderTimeLabel(reminder)}`}
								><Icon name="clock" size={15} /></span
							>{/if}</strong
					>{#if reminder.kind === 'todo' && reminder.dueTime}<small class="todo-time"
							>{reminder.dueTime}</small
						>{/if}</span
				>
				{#if reminder.kind === 'note' && !compactTime && reminderTimeLabel(reminder)}<small
						class:overdue={isReminderOverdue(reminder, today, time)}
						>{reminderTimeLabel(reminder)}{isReminderOverdue(reminder, today, time) &&
						reminder.dueDate === today
							? ' · Overdue'
							: ''}</small
					>{/if}
				{#if reminder.notes}<span class="event-description">{reminder.notes}</span>{/if}
				{#if reminder.dueDate && reminder.dueDate !== today && reminder.dueDate !== contextDate}
					<small
						class:overdue={reminder.kind !== 'note' &&
							!reminder.completedAt &&
							reminder.dueDate < today}
					>
						{dateLabel(reminder.dueDate, { day: 'numeric', month: 'short' })}
					</small>
				{/if}
			</button>
		</div>
	{/each}
</div>

<style>
	.reminder-title-row {
		display: flex;
		align-items: baseline;
		gap: 12px;
		width: 100%;
	}
	.reminder-title-row strong {
		min-width: 0;
		flex: 1;
		overflow-wrap: anywhere;
	}
	.todo-time {
		flex: none;
		white-space: nowrap;
	}
	.overdue-row .reminder-copy,
	.overdue-row .reminder-copy small,
	.overdue-row .event-description,
	.overdue-row .repeat-marker {
		color: var(--danger);
	}

	.note-time-marker {
		display: inline-flex;
		vertical-align: -2px;
		margin-left: 7px;
		color: var(--muted);
	}
	.note-title-icon {
		display: inline-flex;
		vertical-align: -3px;
		margin-right: 7px;
	}
	.reminder-control {
		width: 44px;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
</style>

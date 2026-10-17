<script lang="ts">
	import type { Reminder } from '../domain.ts';
	import { reminderStatus } from '../recurrence.ts';
	import Icon from './Icon.svelte';
	import { dateKey, dateLabel } from '../dates.ts';
	let {
		reminder,
		today,
		timeZone,
		showStatus = true
	}: { reminder: Reminder; today: string; timeZone: string; showStatus?: boolean } = $props();
</script>

<div class="reminder-summary" class:resolved={!!reminder.completedAt || !!reminder.clearedAt}>
	<span class="history-symbol"
		><Icon
			name={reminder.kind === 'note'
				? 'note'
				: reminder.completedAt
					? 'check'
					: reminder.clearedAt
						? 'layers'
						: 'list'}
			size={17}
		/></span
	>
	<div>
		<strong>{reminder.title}</strong>{#if reminder.repeat}<span class="repeat-marker"
				><Icon name="repeat" size={14} /></span
			>{/if}
		{#if showStatus && reminder.kind !== 'note'}<small
				>{reminderStatus(reminder, today)}{#if reminder.completedAt}
					· {dateLabel(dateKey(new Date(reminder.completedAt), timeZone), {
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					})}{/if}</small
			>{/if}
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
	small {
		display: block;
		color: var(--muted);
		font-size: 12px;
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
</style>

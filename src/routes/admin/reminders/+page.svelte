<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { canCompleteReminder } from '#lib/reminder-completion.ts';
	import { localTime, reminderTimeLabel } from '#lib/reminder-time.ts';
	import { api } from '#lib/api.ts';
	import { dateKey, dateLabel } from '#lib/dates.ts';
	import type { Reminder } from '#lib/domain.ts';
	import { reminderGroups, type ReminderFilter } from '#lib/reminder-management.ts';
	import { managementOccurrences, repeatLabel } from '#lib/recurrence.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ReminderEditor from '#lib/components/ReminderEditor.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let now = $state(new Date());
	let today = $state(untrack(() => data.today));
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let loadedCount = $state(untrack(() => data.reminders.length));
	let hasMore = $state(untrack(() => data.reminders.length === 200));
	async function more() {
		busy = true;
		try {
			const next = await api<Reminder[]>(`/api/reminders?offset=${loadedCount}`);
			loadedCount += next.length;
			hasMore = next.length === 200;
			reminders = [...new Map([...reminders, ...next].map((r) => [r.id, r])).values()];
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	let filter = $state<ReminderFilter>('active');
	let query = $state('');
	let groups = $derived(
		reminderGroups(
			managementOccurrences(reminders, today, filter),
			today,
			filter,
			query,
			'',
			localTime(now, data.timeZone)
		)
	);
	let editing = $state<Reminder | null>(null),
		editorOpen = $state(false),
		busy = $state(false);
	let message = $state(''),
		failure = $state('');
	function openEditor(item: Reminder | null = null) {
		editing = item ? reminders.find((r) => r.id === item.id) || item : null;
		editorOpen = true;
		failure = '';
	}
	function replace(item: Reminder) {
		reminders = [...reminders.filter((r) => r.id !== item.id), item];
	}
	function saved(item: Reminder) {
		replace(item);
		editorOpen = false;
		query = '';
		filter = 'all';
		message = 'Reminder saved.';
	}
	async function refresh() {
		if (busy) return;
		busy = true;
		failure = '';
		try {
			reminders = await api<Reminder[]>('/api/reminders');
			loadedCount = reminders.length;
			hasMore = loadedCount === 200;
			message = 'List refreshed.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function change(item: Reminder) {
		today = dateKey(new Date(), data.timeZone);
		if (busy || (!item.completedAt && !canCompleteReminder(item, today))) return;
		busy = true;
		failure = '';
		message = '';
		try {
			replace(
				await api<Reminder>(`/api/reminders/${item.id}/complete`, {
					method: 'POST',
					body: JSON.stringify({
						version: item.version,
						completed: !item.completedAt,
						...(item.occurrenceDate ? { occurrenceDate: item.occurrenceDate } : {})
					})
				})
			);
			message = item.completedAt ? 'To-do restored.' : 'To-do completed.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		const updateDay = () => {
			now = new Date();
			today = dateKey(now, data.timeZone);
		};
		updateDay();
		const timer = setInterval(updateDay, 30000);
		const id = new URLSearchParams(window.location.search).get('reminder');
		const item = reminders.find((r) => r.id === id);
		if (item) openEditor(item);
		else if (id)
			void api<Reminder>(`/api/reminders/${encodeURIComponent(id)}`)
				.then(openEditor)
				.catch((e) => (failure = e.message));
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Reminders · Pi Family Calendar</title></svelte:head>
<main class="management reminder-management">
	<header class="manage-page-heading">
		<div>
			<h1>Reminders</h1>
		</div>
		<button class="primary-button" onclick={() => openEditor()} disabled={busy}
			><Icon name="plus" size={20} />Add reminder</button
		>
	</header>
	<section class="reminder-library" aria-label="Reminder library">
		<div class="library-toolbar">
			<div class="library-tabs" aria-label="Reminder status">
				{#each [{ id: 'active', label: 'Active' }, { id: 'completed', label: 'Completed' }, { id: 'all', label: 'All' }] as tab}<button
						aria-pressed={filter === tab.id}
						onclick={() => (filter = tab.id as ReminderFilter)}>{tab.label}</button
					>{/each}
			</div>
			<button class="icon-button" aria-label="Refresh reminders" disabled={busy} onclick={refresh}
				><Icon name="sync" size={20} /></button
			>
		</div>
		<div class="library-filters">
			<label class="search-field"
				><Icon name="search" size={19} /><input
					type="search"
					aria-label="Search reminders"
					bind:value={query}
					placeholder="Find a reminder…"
				/></label
			>
		</div>
		{#if message}<p class="library-message success-message" role="status">{message}</p>{/if}
		{#if failure && !editorOpen}<div class="error-message library-message" role="alert">
				<p>{failure}</p>
				<button disabled={busy} onclick={refresh}>Refresh list</button>
			</div>{/if}
		<div class="library-groups">
			{#each groups as group}<section class="library-group">
					<h2>{group.title}<span>{group.items.length}</span></h2>
					{#each group.items as reminder (`${reminder.id}:${reminder.occurrenceDate || 'series'}`)}<article
							class="library-item"
							class:is-note={reminder.kind === 'note'}
							class:completed={!!reminder.completedAt}
						>
							{#if reminder.kind === 'todo' && !reminder.repeat}<button
									class="completion-button"
									aria-label={`${reminder.completedAt ? 'Undo' : 'Complete'} ${reminder.title}`}
									disabled={busy ||
										(!reminder.completedAt && !canCompleteReminder(reminder, today))}
									title={!reminder.completedAt && !canCompleteReminder(reminder, today)
										? 'Available on its scheduled day'
										: undefined}
									onclick={() => change(reminder)}
									><span class="checkbox"
										>{#if reminder.completedAt}<Icon name="check" size={18} />{/if}</span
									></button
								>{:else}<span class="note-symbol"><Icon name="note" size={21} /></span>{/if}
							<button
								class="library-item-body"
								disabled={busy}
								onclick={() => openEditor(reminder)}
								aria-label={`Edit ${reminder.title}`}
								><strong
									>{reminder.title}{#if reminder.repeat}<span
											class="repeat-marker"
											aria-label={repeatLabel(reminder)}
											title={repeatLabel(reminder)}><Icon name="repeat" size={15} /></span
										>{/if}</strong
								>{#if reminder.notes}<span class="library-item-description">{reminder.notes}</span
									>{/if}<small
									>{[
										reminder.repeat ? 'Template · ' + repeatLabel(reminder) : '',
										reminderTimeLabel(reminder),
										reminder.dueDate
											? dateLabel(reminder.dueDate, { day: 'numeric', month: 'short' })
											: '',
										reminder.kind === 'note' ? 'Note' : ''
									]
										.filter(Boolean)
										.join(' · ')}</small
								></button
							><Icon name="right" size={16} />
						</article>{/each}
				</section>{:else}<div class="library-empty">
					<Icon name={filter === 'completed' ? 'check' : 'list'} size={32} />
					<h2>
						{query
							? 'No matching reminders'
							: filter === 'completed'
								? 'Nothing completed yet'
								: 'A little breathing room'}
					</h2>
					<p>
						{query
							? 'Try another search.'
							: filter === 'completed'
								? 'Completed to-dos will be kept here.'
								: 'Add a to-do or a note whenever you need one.'}
					</p>
					{#if query}<button
							onclick={() => {
								query = '';
							}}>Clear filters</button
						>{/if}
				</div>{/each}
		</div>
	</section>
	{#if hasMore}<button disabled={busy} onclick={more}>Load more reminders</button>
		<p class="management-hint">Search and filters apply to loaded reminders.</p>{/if}
</main>

{#if editorOpen}<ReminderEditor
		reminder={editing}
		onclose={() => (editorOpen = false)}
		onsaved={saved}
		onremoved={(id) => {
			reminders = reminders.filter((r) => r.id !== id);
			editorOpen = false;
			message = 'Reminder removed.';
		}}
	/>{/if}

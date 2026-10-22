<script lang="ts">
	import { onMount, untrack, tick } from 'svelte';
	import { canCompleteReminder } from '#lib/reminder-completion.ts';
	import { localTime, reminderTimeLabel } from '#lib/reminder-time.ts';
	import { api } from '#lib/api.ts';
	import { dateKey, dateLabel } from '#lib/dates.ts';
	import type { Reminder } from '#lib/domain.ts';
	import {
		reminderGroups,
		type ReminderFilter,
		type ReminderKindFilter
	} from '#lib/reminder-management.ts';
	import { managementOccurrences, repeatLabel } from '#lib/recurrence.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ReminderEditor from '#lib/components/ReminderEditor.svelte';
	import Modal from '#lib/components/Modal.svelte';
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
	let kind = $state<ReminderKindFilter>('all');
	let selectedKind = $derived(filter === 'completed' ? 'todo' : kind);
	let query = $state('');
	let searchOpen = $state(false);
	let searchInput = $state<HTMLInputElement>();
	let searchToggle: HTMLButtonElement;
	async function toggleSearch() {
		searchOpen = !searchOpen;
		if (!searchOpen) query = '';
		await tick();
		if (searchOpen) searchInput?.focus();
		else searchToggle?.focus();
	}
	let groups = $derived(
		reminderGroups(
			managementOccurrences(reminders, today, filter === 'templates' ? 'all' : filter),
			today,
			filter,
			query,
			'',
			localTime(now, data.timeZone),
			selectedKind
		)
	);
	let editing = $state<Reminder | null>(null),
		editorOpen = $state(false),
		busy = $state(false);
	let message = $state(''),
		failure = $state('');
	let cleanupOpen = $state(false),
		cleanupBusy = $state(false),
		cleanupError = $state('');
	let cleanup = $state<{ count: number; revision: string } | null>(null);
	async function reviewCompleted() {
		cleanupOpen = true;
		cleanup = null;
		cleanupError = '';
		cleanupBusy = true;
		try {
			cleanup = await api('/api/admin/reminders/completed');
		} catch (cause) {
			cleanupError = (cause as Error).message;
		} finally {
			cleanupBusy = false;
		}
	}
	async function deleteCompleted() {
		if (!cleanup?.count || cleanupBusy) return;
		cleanupBusy = true;
		cleanupError = '';
		try {
			const result = await api<{ deleted: number }>('/api/admin/reminders/completed', {
				method: 'DELETE',
				body: JSON.stringify({ revision: cleanup.revision })
			});
			cleanupOpen = false;
			message = `${result.deleted} completed ${result.deleted === 1 ? 'ToDo' : 'ToDos'} deleted.`;
			// Reload pagination after a deletion spanning every page.
			reminders = [];
			loadedCount = 0;
			hasMore = true;
			try {
				reminders = await api<Reminder[]>('/api/reminders');
				loadedCount = reminders.length;
				hasMore = loadedCount === 200;
				failure = '';
			} catch {
				failure =
					'Deletion completed, but the list could not refresh. Refresh the list to continue.';
			}
		} catch (cause) {
			cleanupError = (cause as Error).message;
			cleanup = null;
		} finally {
			cleanupBusy = false;
		}
	}
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
		kind = 'all';
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
			<div class="status-tabs" role="group" aria-label="Reminder status">
				{#each [{ id: 'active', label: 'Active' }, { id: 'completed', label: 'Completed' }, { id: 'templates', label: 'Templates' }, { id: 'all', label: 'All' }] as tab}<button
						aria-pressed={filter === tab.id}
						onclick={() => (filter = tab.id as ReminderFilter)}>{tab.label}</button
					>{/each}
			</div>
			<div class="kind-tabs" role="group" aria-label="Reminder type">
				{#each [{ id: 'all', label: 'All types', icon: 'layers' }, { id: 'todo', label: 'ToDos', icon: 'check' }, { id: 'note', label: 'Notes', icon: 'note' }] as tab}
					<button
						aria-pressed={selectedKind === tab.id}
						disabled={filter === 'completed' && tab.id !== 'todo'}
						onclick={() => {
							if (filter !== 'completed') kind = tab.id as ReminderKindFilter;
						}}><Icon name={tab.icon} size={17} />{tab.label}</button
					>
				{/each}
			</div>
			<div class="search-controls">
				<button
					bind:this={searchToggle!}
					class="icon-button search-toggle"
					aria-label={searchOpen ? 'Close search' : 'Search reminders'}
					title={searchOpen ? 'Close search' : 'Search reminders'}
					aria-expanded={searchOpen}
					aria-controls="reminder-search"
					onclick={toggleSearch}><Icon name={searchOpen ? 'close' : 'search'} size={20} /></button
				>
				<button
					class="icon-button refresh-button"
					aria-label="Refresh reminders"
					title="Refresh reminders"
					disabled={busy}
					onclick={refresh}><Icon name="sync" size={20} /></button
				>
			</div>
		</div>
		{#if searchOpen}<div class="expanded-search" id="reminder-search">
				<label class="search-field"
					><Icon name="search" size={19} /><input
						bind:this={searchInput!}
						type="search"
						aria-label="Search reminders"
						bind:value={query}
						placeholder="Find a reminder…"
						onkeydown={(event) => {
							if (event.key === 'Escape') {
								event.preventDefault();
								void toggleSearch();
							}
						}}
					/></label
				>
			</div>{/if}
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
								>{:else}<span
									class="note-symbol"
									role="img"
									aria-label={reminder.kind === 'todo' ? 'ToDo template' : 'Note'}
									><Icon name={reminder.kind === 'todo' ? 'check' : 'note'} size={21} /></span
								>{/if}
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
					{#if query || kind !== 'all' || filter !== 'active'}<button
							onclick={() => {
								query = '';
								kind = 'all';
								filter = 'active';
							}}>Clear filters</button
						>{/if}
				</div>{/each}
		</div>
	</section>
	{#if hasMore}<button disabled={busy} onclick={more}>Load more reminders</button>
		<p class="management-hint">Search and filters apply to loaded reminders.</p>{/if}
	{#if filter === 'completed'}<footer class="completed-cleanup">
			<button class="quiet-danger" disabled={busy || cleanupBusy} onclick={reviewCompleted}
				>Delete all completed</button
			>
		</footer>{/if}
</main>

{#if cleanupOpen}<Modal title="Delete all completed?" onclose={() => (cleanupOpen = false)}>
		{#if cleanupBusy && !cleanup}<p role="status">Checking completed reminders…</p>
		{:else if cleanup?.count}<p>
				Permanently delete all <strong
					>{cleanup.count} completed {cleanup.count === 1 ? 'ToDo' : 'ToDos'}</strong
				>?
			</p>
			<p>
				This includes items hidden by search or filters and items not loaded in this list. Notes,
				unfinished ToDos and repeating templates will stay.
			</p>
			<p>This cannot be undone.</p>
		{:else if cleanup}<p>There are no completed ToDos to delete.</p>{/if}
		{#if cleanupError}<p class="error-message" role="alert">{cleanupError}</p>{/if}
		<div class="form-actions">
			<button disabled={cleanupBusy} onclick={() => (cleanupOpen = false)}>Cancel</button>
			{#if cleanup?.count}<button
					class="delete-completed-button"
					disabled={cleanupBusy}
					onclick={deleteCompleted}
					>{cleanupBusy ? 'Deleting…' : `Delete ${cleanup.count} completed`}</button
				>{/if}
		</div>
	</Modal>{/if}

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

<style>
	.completed-cleanup {
		display: flex;
		justify-content: flex-end;
		padding: 20px 0;
	}
	.delete-completed-button {
		color: var(--danger);
		border: 1px solid currentColor;
	}
	.reminder-library {
		container-type: inline-size;
	}
	.library-toolbar {
		display: grid;
		grid-template-columns: auto auto 1fr;
		grid-template-areas: 'status type actions';
		gap: 24px;
		padding: 8px 24px;
		border-bottom: 1px solid var(--line);
	}
	.status-tabs {
		grid-area: status;
		display: flex;
		gap: 24px;
	}
	.status-tabs button {
		position: relative;
		min-height: 62px;
		padding: 12px 4px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--muted);
		font-size: 15px;
		font-weight: 500;
	}
	.status-tabs button:hover {
		color: var(--text);
	}
	.status-tabs button[aria-pressed='true'] {
		color: var(--text);
	}
	.status-tabs button[aria-pressed='true']::after {
		content: '';
		position: absolute;
		bottom: -9px;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 3px 3px 0 0;
		background: var(--accent);
	}
	.kind-tabs {
		grid-area: type;
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 13px;
	}
	.kind-tabs button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		flex: 1;
		white-space: nowrap;
		min-height: 42px;
		padding: 8px 14px;
		font-size: 14px;
		color: var(--muted);
		border: 1px solid transparent;
		border-radius: 9px;
		background: transparent;
	}
	.kind-tabs button:hover:not(:disabled) {
		color: var(--text);
	}
	.kind-tabs button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.kind-tabs button[aria-pressed='true'] {
		color: var(--control-ink);
		background: var(--control-selected);
		border-color: var(--control-edge);
		box-shadow: inset 0 1px var(--control-shine);
	}
	.search-controls {
		grid-area: actions;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
		min-width: 0;
	}
	.search-field {
		flex: 1;
		min-width: 0;
		margin: 0;
		border-radius: 11px;
	}
	.search-field:focus-within {
		border-color: var(--accent);
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.search-field input:focus-visible {
		outline: none;
		box-shadow: none;
	}
	.search-field input {
		width: 100%;
		min-width: 0;
		min-height: 48px;
		font-size: 14px;
	}
	.refresh-button {
		flex-shrink: 0;
		color: var(--muted);
	}
	.search-toggle[aria-expanded='true'] {
		background: var(--accent-soft);
		color: var(--text);
	}
	.expanded-search {
		padding: 18px 24px;
		border-bottom: 1px solid var(--line);
	}
	@container (max-width: 800px) {
		.library-toolbar {
			grid-template-columns: 1fr auto;
			grid-template-areas: 'status status' 'type actions';
			gap: 16px;
			padding: 0 20px 18px;
		}
		.status-tabs {
			border-bottom: 1px solid var(--line);
		}
		.status-tabs button[aria-pressed='true']::after {
			bottom: -1px;
		}
		.kind-tabs {
			width: fit-content;
		}
	}
	@container (max-width: 440px) {
		.library-toolbar {
			padding: 0 12px 14px;
			gap: 14px 8px;
		}
		.status-tabs {
			width: 100%;
			gap: 0;
			justify-content: space-between;
		}
		.status-tabs button {
			min-height: 56px;
			font-size: 13px;
		}
		.kind-tabs button {
			padding: 8px;
			font-size: 13px;
		}
		.kind-tabs :global(svg) {
			display: none;
		}
		.search-controls .icon-button {
			width: 40px;
			min-width: 40px;
		}
		.expanded-search {
			padding: 16px;
		}
	}
</style>

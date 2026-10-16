<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import { dateLabel } from '#lib/dates.ts';
	import { reminderLists, type Reminder } from '#lib/domain.ts';
	import { reminderGroups, type ReminderFilter } from '#lib/reminder-management.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let filter = $state<ReminderFilter>('active');
	let query = $state(''),
		listFilter = $state('');
	let groups = $derived(reminderGroups(reminders, data.today, filter, query, listFilter));
	let kind = $state<'todo' | 'note'>('todo');
	let title = $state(''),
		notes = $state(''),
		list = $state<string>('Household'),
		dueDate = $state('');
	let editing = $state<Reminder | null>(null);
	let editorOpen = $state(false),
		deleting = $state(false),
		busy = $state(false);
	let message = $state(''),
		failure = $state('');
	function openEditor(reminder: Reminder | null = null) {
		editing = reminder;
		kind = reminder?.kind || 'todo';
		title = reminder?.title || '';
		notes = reminder?.notes || '';
		list = reminder?.list || 'Household';
		dueDate = reminder?.dueDate || '';
		deleting = false;
		failure = '';
		message = '';
		editorOpen = true;
	}
	function replace(item: Reminder) {
		reminders = [...reminders.filter((r) => r.id !== item.id), item];
	}
	async function refresh() {
		if (busy) return;
		busy = true;
		failure = '';
		try {
			reminders = await api<Reminder[]>('/api/reminders');
			message = 'List refreshed.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failure = '';
		try {
			const body = {
				kind,
				title,
				notes,
				list,
				dueDate: dueDate || null,
				...(editing ? { version: editing.version } : {})
			};
			const updated = await api<Reminder>(
				editing ? `/api/reminders/${editing.id}` : '/api/reminders',
				{ method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }
			);
			replace(updated);
			filter = updated.completedAt
				? 'completed'
				: updated.kind === 'note' && updated.dueDate && updated.dueDate < data.today
					? 'all'
					: 'active';
			query = '';
			listFilter = '';
			message = editing ? 'Changes saved.' : kind === 'note' ? 'Note added.' : 'To-do added.';
			editorOpen = false;
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function change(reminder: Reminder, remove = false) {
		if (busy) return;
		busy = true;
		failure = '';
		message = '';
		try {
			if (remove) {
				await api(`/api/reminders/${reminder.id}`, {
					method: 'DELETE',
					body: JSON.stringify({ version: reminder.version })
				});
				reminders = reminders.filter((r) => r.id !== reminder.id);
				editorOpen = false;
				message = 'Reminder deleted.';
			} else {
				const updated = await api<Reminder>(`/api/reminders/${reminder.id}`, {
					method: 'PATCH',
					body: JSON.stringify({ version: reminder.version, completed: !reminder.completedAt })
				});
				replace(updated);
				message = reminder.completedAt ? 'To-do restored.' : 'To-do completed.';
			}
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function reloadEdit() {
		if (busy || !editing) return;
		const id = editing.id;
		await refresh();
		if (failure) return;
		const latest = reminders.find((r) => r.id === id);
		if (latest) openEditor(latest);
		else {
			editorOpen = false;
			message = 'This reminder has been removed on another screen.';
		}
	}
	onMount(() => {
		const id = new URLSearchParams(window.location.search).get('reminder');
		const item = reminders.find((r) => r.id === id);
		if (item) openEditor(item);
	});
</script>

<svelte:head><title>Reminders · Pi Family Calendar</title></svelte:head>
<main class="management reminder-management">
	<header class="manage-page-heading">
		<div>
			<span class="eyebrow">YOUR EVERYDAY</span>
			<h1>Reminders</h1>
			<p>Little things to do. Useful things to remember.</p>
		</div>
		<button class="primary-button" onclick={() => openEditor()} disabled={busy}
			><Icon name="plus" size={20} />New reminder</button
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
			><select aria-label="Filter by list" bind:value={listFilter}
				><option value="">All lists</option>{#each reminderLists as name}<option>{name}</option
					>{/each}</select
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
					{#each group.items as reminder (reminder.id)}<article
							class="library-item"
							class:is-note={reminder.kind === 'note'}
							class:completed={!!reminder.completedAt}
						>
							{#if reminder.kind === 'todo'}<button
									class="completion-button"
									aria-label={`${reminder.completedAt ? 'Undo' : 'Complete'} ${reminder.title}`}
									disabled={busy}
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
								><strong>{reminder.title}</strong>{#if reminder.notes}<span
										class="library-item-description">{reminder.notes}</span
									>{/if}<small
									>{reminder.list}{reminder.dueDate
										? ` · ${dateLabel(reminder.dueDate, { day: 'numeric', month: 'short' })}`
										: ''}{reminder.kind === 'note' ? ' · Note' : ''}</small
								></button
							><Icon name="right" size={16} />
						</article>{/each}
				</section>{:else}<div class="library-empty">
					<Icon name={filter === 'completed' ? 'check' : 'list'} size={32} />
					<h2>
						{query || listFilter
							? 'No matching reminders'
							: filter === 'completed'
								? 'Nothing completed yet'
								: 'A little breathing room'}
					</h2>
					<p>
						{query || listFilter
							? 'Try another search or list.'
							: filter === 'completed'
								? 'Completed to-dos will be kept here.'
								: 'Add a to-do or a note whenever you need one.'}
					</p>
					{#if query || listFilter}<button
							onclick={() => {
								query = '';
								listFilter = '';
							}}>Clear filters</button
						>{/if}
				</div>{/each}
		</div>
	</section>
	<details class="management-about">
		<summary>About reminders</summary>
		<p>
			Reminders are saved on this installation. Lists organise items; everyone using this
			installation can see them. Notes stay visible without a completion checkbox. Repeating
			reminders and cloud access are not available yet.
		</p>
		<p>
			Create and edit calendar events in <a
				href="https://calendar.google.com/"
				target="_blank"
				rel="noreferrer">Google Calendar</a
			>.
		</p>
	</details>
</main>

{#if editorOpen}
	<Modal
		title={editing ? (kind === 'note' ? 'Edit note' : 'Edit to-do') : 'New reminder'}
		onclose={() => (editorOpen = false)}
	>
		<form class="reminder-editor" onsubmit={save}>
			<fieldset disabled={busy}>
				<div class="editor-kind" aria-label="Reminder type">
					<button type="button" aria-pressed={kind === 'todo'} onclick={() => (kind = 'todo')}
						><Icon name="check" size={18} />To do</button
					><button type="button" aria-pressed={kind === 'note'} onclick={() => (kind = 'note')}
						><Icon name="note" size={18} />Note</button
					>
				</div>
				<p class="management-hint">
					{kind === 'note' ? 'Stays visible, without a checkbox.' : 'Tick it off when it is done.'}
				</p>
				<label for="reminder-title"
					>{kind === 'note' ? 'What would you like to remember?' : 'What needs doing?'}</label
				><input
					id="reminder-title"
					bind:value={title}
					required
					maxlength="160"
					autocomplete="off"
				/>
				<label for="reminder-notes">Details <span class="muted">· optional</span></label><textarea
					id="reminder-notes"
					bind:value={notes}
					maxlength="2000"
					rows="3"></textarea>
				<div class="editor-fields">
					<div>
						<label for="reminder-date">{kind === 'note' ? 'Show on' : 'Due date'}</label><input
							id="reminder-date"
							type="date"
							bind:value={dueDate}
							min="1900-01-01"
							max="9999-12-31"
						/>
					</div>
					<div>
						<label for="reminder-list">List</label><select id="reminder-list" bind:value={list}
							>{#each reminderLists as name}<option>{name}</option>{/each}</select
						>
					</div>
				</div>
				<div class="editor-date-hint">
					<span class="management-hint">No date means anytime.</span>{#if dueDate}<button
							type="button"
							onclick={() => (dueDate = '')}>Clear date</button
						>{/if}
				</div>
				{#if editing?.completedAt && kind === 'note'}<p class="management-hint">
						Changing this completed to-do into a note will clear its completion.
					</p>{/if}
			</fieldset>
			{#if failure}<div role="alert" class="error-message">
					<p>{failure}</p>
					{#if editing}<button type="button" disabled={busy} onclick={reloadEdit}
							>Reload saved reminder (discard this edit)</button
						>{/if}
				</div>{/if}
			<div class="editor-actions">
				<button type="button" disabled={busy} onclick={() => (editorOpen = false)}>Cancel</button
				><button class="primary-button" disabled={busy} type="submit"
					>{busy
						? 'Saving…'
						: editing
							? 'Save changes'
							: kind === 'note'
								? 'Add note'
								: 'Add to-do'}</button
				>
			</div>
		</form>
		{#if editing}<div class="editor-delete">
				{#if deleting}<p>
						Delete this {editing.kind === 'note' ? 'note' : 'to-do'}? This cannot be undone.
					</p>
					<div class="form-actions">
						<button
							class="quiet-danger"
							disabled={busy}
							onclick={() => editing && change(editing, true)}>Delete reminder</button
						><button disabled={busy} onclick={() => (deleting = false)}>Keep it</button>
					</div>{:else}<button
						class="quiet-danger"
						disabled={busy}
						onclick={() => (deleting = true)}
						>Delete {editing.kind === 'note' ? 'note' : 'to-do'}</button
					>{/if}
			</div>{/if}
	</Modal>
{/if}

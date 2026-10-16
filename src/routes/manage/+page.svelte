<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import { dateLabel } from '#lib/dates.ts';
	import { reminderLists, type Reminder } from '#lib/domain.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let title = $state('');
	let notes = $state('');
	let list = $state<string>('Household');
	let dueDate = $state('');
	let editing = $state<Reminder | null>(null);
	let deleting = $state<string | null>(null);
	let busy = $state(false);
	let message = $state('');
	let failure = $state('');
	function reset() {
		title = '';
		notes = '';
		list = 'Household';
		dueDate = '';
		editing = null;
	}
	async function refresh() {
		reminders = await api<Reminder[]>('/api/reminders');
	}
	function edit(reminder: Reminder) {
		editing = reminder;
		title = reminder.title;
		notes = reminder.notes || '';
		list = reminder.list;
		dueDate = reminder.dueDate || '';
		document.getElementById('reminder-title')?.focus();
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		failure = '';
		try {
			const body = {
				title,
				notes,
				list,
				dueDate: dueDate || null,
				...(editing ? { version: editing.version } : {})
			};
			await api(editing ? `/api/reminders/${editing.id}` : '/api/reminders', {
				method: editing ? 'PATCH' : 'POST',
				body: JSON.stringify(body)
			});
			message = editing ? 'Reminder updated.' : 'Reminder added.';
			reset();
			await refresh();
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function change(reminder: Reminder, remove = false) {
		busy = true;
		failure = '';
		message = '';
		try {
			await api(`/api/reminders/${reminder.id}`, {
				method: remove ? 'DELETE' : 'PATCH',
				body: JSON.stringify({ version: reminder.version, completed: !reminder.completedAt })
			});
			if (editing?.id === reminder.id) reset();
			deleting = null;
			await refresh();
			message = remove ? 'Reminder deleted.' : 'Reminder updated.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		const id = new URLSearchParams(window.location.search).get('reminder');
		const item = reminders.find((r) => r.id === id);
		if (item) edit(item);
	});
</script>

<svelte:head><title>Manage · Pi Family Calendar</title></svelte:head>
<main class="management">
	<header class="management-header">
		<a href="/" class="back-link"><Icon name="left" /> Calendar</a><span class="source-badge"
			>Development build</span
		>
	</header>
	<div class="management-intro">
		<span class="eyebrow">Family calendar</span>
		<h1>Manage reminders</h1>
		<p>
			Add a reminder here; tick it off on the display. Lists organise items; they are visible to
			everyone using this installation.
		</p>
	</div>
	<div class="management-grid">
		<section class="management-card">
			<h2>{editing ? 'Edit reminder' : 'New reminder'}</h2>
			<form onsubmit={save}>
				<label for="reminder-title">What needs doing?</label><input
					id="reminder-title"
					bind:value={title}
					required
					maxlength="160"
					placeholder="e.g. Pack the swimming bag"
					autocomplete="off"
				/>
				<label for="reminder-notes">Notes <span class="muted">· optional</span></label><textarea
					id="reminder-notes"
					bind:value={notes}
					maxlength="2000"
					rows="3"></textarea>
				<label for="reminder-list">List</label><select id="reminder-list" bind:value={list}
					>{#each reminderLists as name}<option>{name}</option>{/each}</select
				>
				<label for="reminder-date">Due date <span class="muted">· optional</span></label><input
					id="reminder-date"
					type="date"
					bind:value={dueDate}
					min="1900-01-01"
					max="9999-12-31"
				/>
				<label for="reminder-repeat">Repeat</label><select
					id="reminder-repeat"
					disabled
					aria-describedby="repeat-help"
					><option>Does not repeat</option><option>Daily</option><option>Weekly</option></select
				>
				<p id="repeat-help" class="management-hint">
					Recurring reminders are planned. Each occurrence will have its own completion state.
				</p>
				<div class="form-actions">
					<button class="primary-button" disabled={busy} type="submit"
						>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add reminder'}</button
					>{#if editing}<button type="button" disabled={busy} onclick={reset}>Cancel</button>{/if}
				</div>
				{#if message}<p role="status" class="success-message">{message}</p>{/if}{#if failure}<div
						role="alert"
						class="error-message"
					>
						<p>{failure}</p>
						<button
							type="button"
							onclick={async () => {
								try {
									await refresh();
									reset();
									failure = '';
								} catch {
									failure = 'Could not refresh. Please try again.';
								}
							}}>Refresh list and discard this edit</button
						>
					</div>{/if}
			</form>
			<p class="management-hint">
				Local reminders are saved on this server. Repeating reminders and custom list names will
				follow later.
			</p>
		</section>
		<section class="management-card">
			<div class="section-heading">
				<h2>Your reminders</h2>
				<button
					disabled={busy}
					onclick={async () => {
						try {
							await refresh();
						} catch {
							failure = 'Could not refresh. Please try again.';
						}
					}}>Refresh</button
				>
			</div>
			{#each reminders as reminder (reminder.id)}
				<article class="managed-reminder" class:completed={!!reminder.completedAt}>
					<div>
						<strong>{reminder.title}</strong>
						<p>
							{reminder.list}{reminder.dueDate
								? ` · ${dateLabel(reminder.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}`
								: ''}{reminder.completedAt ? ' · Completed' : ''}
						</p>
					</div>
					<div class="reminder-actions">
						<button disabled={busy} onclick={() => change(reminder)}
							>{reminder.completedAt ? 'Undo' : 'Complete'}</button
						><button disabled={busy} onclick={() => edit(reminder)}>Edit</button><button
							class="quiet-danger"
							disabled={busy}
							onclick={() => (deleting = reminder.id)}>Delete</button
						>
					</div>
					{#if deleting === reminder.id}<div class="delete-confirm">
							<p>Delete “{reminder.title}”?</p>
							<button disabled={busy} onclick={() => change(reminder, true)}>Delete reminder</button
							><button disabled={busy} onclick={() => (deleting = null)}>Keep it</button>
						</div>{/if}
				</article>
			{:else}<p class="empty-state">No reminders yet. Start with something small.</p>{/each}
		</section>
	</div>
	<section class="connection-note" id="events">
		<Icon name="calendar" />
		<div>
			<h2>Events</h2>
			<div class="form-actions">
				<button disabled>Add event</button><button disabled>Edit event</button><button disabled
					>Delete event</button
				>
			</div>
			<p>
				This build uses sample events when demo mode is enabled. No accounts are connected, and
				event creation or editing is not available yet.
			</p>
		</div>
	</section>
</main>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { Reminder, RepeatRule, NoteCategory } from '#lib/domain.ts';
	import Icon from './Icon.svelte';
	import DateTimeField from './DateTimeField.svelte';
	import Modal from './Modal.svelte';
	let {
		reminder = null,
		onsaved,
		onremoved,
		onclose,
		inline = false,
		qrToken = '',
		defaultDate = null
	}: {
		reminder?: Reminder | null;
		onsaved: (item: Reminder) => void;
		onremoved: (id: string) => void;
		onclose: () => void;
		inline?: boolean;
		qrToken?: string;
		defaultDate?: string | null;
	} = $props();
	let categories = $state<NoteCategory[]>([]);
	let categoryId = $state(untrack(() => reminder?.categoryId || 'general'));
	onMount(() => {
		void api<NoteCategory[]>('/api/categories')
			.then((v) => (categories = v))
			.catch((e) => (failure = e.message));
	});
	const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
		n.toString(16).padStart(2, '0')
	).join('');
	let editing = $state(untrack(() => reminder));
	let kind = $state<'todo' | 'note'>(untrack(() => reminder?.kind || 'todo'));
	let title = $state(untrack(() => reminder?.title || ''));
	let notes = $state(untrack(() => reminder?.notes || ''));
	let dueDate = $state(untrack(() => (reminder ? reminder.dueDate || '' : defaultDate || '')));
	let dueTime = $state(untrack(() => reminder?.dueTime || ''));
	let showFrom = $state(untrack(() => reminder?.showFrom || ''));
	let showUntil = $state(untrack(() => reminder?.showUntil || ''));
	let windowed = $state(untrack(() => !!reminder?.showFrom));
	function setWindowed(value: boolean) {
		windowed = value;
		if (value && !showFrom) {
			showFrom = '00:00';
			if (!showUntil) showUntil = showFrom;
		}
	}
	function setShowFrom(value: string) {
		if (!showUntil || showUntil === showFrom) showUntil = value;
		showFrom = value;
	}
	$effect(() => {
		if (!dueDate) {
			dueTime = '';
			showFrom = '';
			showUntil = '';
			windowed = false;
		}
	});
	$effect(() => {
		if (kind === 'note') dueTime = '';
		else {
			showFrom = '';
			showUntil = '';
			windowed = false;
		}
	});
	let frequency = $state<RepeatRule['frequency'] | ''>(
		untrack(() => reminder?.repeat?.frequency || '')
	);
	let interval = $state<number | undefined>(untrack(() => reminder?.repeat?.interval || 1));
	let until = $state(untrack(() => reminder?.repeat?.until || ''));
	let busy = $state(false),
		deleting = $state(false),
		failure = $state('');
	let repeat = $derived<RepeatRule | null>(
		frequency
			? {
					frequency,
					interval: frequency === 'weekdays' ? 1 : Number(interval),
					until: until || null
				}
			: null
	);
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failure = '';
		try {
			const item = await api<Reminder>(
				qrToken ? '/api/qr/reminder' : editing ? `/api/reminders/${editing.id}` : '/api/reminders',
				{
					method: qrToken ? 'POST' : editing ? 'PATCH' : 'POST',
					headers: qrToken ? { Authorization: `Bearer ${qrToken}` } : {},
					body: JSON.stringify({
						...(qrToken ? { requestId } : {}),
						kind,
						categoryId: kind === 'note' ? categoryId : 'general',
						title,
						notes,
						list: 'General',
						dueDate: dueDate || null,
						dueTime: kind === 'todo' && dueDate ? dueTime || null : null,
						showFrom: kind === 'note' && windowed && dueDate ? showFrom : null,
						showUntil: kind === 'note' && windowed && dueDate ? showUntil : null,
						repeat,
						...(editing ? { version: editing.version } : {})
					})
				}
			);
			onsaved(item);
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function remove() {
		if (busy || !editing) return;
		busy = true;
		failure = '';
		try {
			await api(qrToken ? '/api/qr/reminder' : `/api/reminders/${editing.id}`, {
				method: 'DELETE',
				headers: qrToken ? { Authorization: `Bearer ${qrToken}` } : {},
				body: JSON.stringify({
					version: editing.version,
					...(qrToken ? { confirmed: true, requestId } : {})
				})
			});
			onremoved(editing.id);
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function reloadEdit() {
		if (busy || !editing) return;
		busy = true;
		try {
			const items = qrToken
				? [
						(
							await api<{ reminder: Reminder }>('/api/qr/reminder', {
								headers: { Authorization: `Bearer ${qrToken}` }
							})
						).reminder
					]
				: [await api<Reminder>(`/api/reminders/${editing.id}`)];
			const latest = items.find((r) => r.id === editing?.id);
			if (!latest) {
				onremoved(editing.id);
				return;
			}
			categories = await api<NoteCategory[]>('/api/categories');
			categoryId = latest.categoryId || 'general';
			editing = latest;
			kind = latest.kind;
			title = latest.title;
			notes = latest.notes || '';
			dueDate = latest.dueDate || '';
			dueTime = latest.dueTime || '';
			showFrom = latest.showFrom || '';
			showUntil = latest.showUntil || '';
			windowed = !!latest.showFrom;
			frequency = latest.repeat?.frequency || '';
			interval = latest.repeat?.interval || 1;
			until = latest.repeat?.until || '';
			failure = '';
			deleting = false;
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet form()}
	<form class="reminder-editor" onsubmit={save}>
		<fieldset disabled={busy}>
			<div class="editor-kind" aria-label="Reminder type">
				<button type="button" aria-pressed={kind === 'todo'} onclick={() => (kind = 'todo')}
					><Icon name="check" size={18} />To do</button
				><button type="button" aria-pressed={kind === 'note'} onclick={() => (kind = 'note')}
					><Icon name="note" size={18} />Note</button
				>
			</div>

			{#if kind === 'note'}<label for="reminder-category">Category</label><select
					id="reminder-category"
					bind:value={categoryId}
					>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select
				>{/if}
			<label for="reminder-title"
				>{kind === 'note' ? 'What would you like to remember?' : 'What needs doing?'}</label
			><input id="reminder-title" bind:value={title} required maxlength="160" autocomplete="off" />
			<label for="reminder-notes">Details <span class="muted">· optional</span></label><textarea
				id="reminder-notes"
				bind:value={notes}
				maxlength="2000"
				rows="3"></textarea>
			<label for="reminder-date"
				>{frequency ? 'Starts on' : kind === 'note' ? 'Show on' : 'Due date'}</label
			>
			<DateTimeField
				id="reminder-date"
				type="date"
				bind:value={dueDate}
				defaultToToday={!editing}
				required={!!frequency}
				min="1900-01-01"
				max="9999-12-31"
				label={frequency ? 'start date' : kind === 'note' ? 'show date' : 'due date'}
			/>
			{#if dueDate && kind === 'todo'}
				<label for="reminder-due-time">Due time <span class="muted">· optional</span></label>
				<DateTimeField id="reminder-due-time" type="time" bind:value={dueTime} label="due time" />
			{:else if dueDate && kind === 'note'}
				<label for="note-visibility">Show</label>
				<select id="note-visibility" bind:value={() => windowed, setWindowed}
					><option value={false}>All day</option><option value={true}>Between times</option></select
				>
				{#if windowed}<div class="editor-fields">
						<div>
							<label for="note-from">Show from</label><DateTimeField
								label="start time"
								id="note-from"
								type="time"
								required
								bind:value={() => showFrom, setShowFrom}
							/>
						</div>
						<div>
							<label for="note-until">Until</label><DateTimeField
								label="end time"
								id="note-until"
								type="time"
								required
								min={showFrom || undefined}
								bind:value={showUntil}
							/>
						</div>
					</div>
				{/if}
			{/if}
			{#if !editing || editing.repeat}<label for="reminder-repeat">Repeat</label><select
					id="reminder-repeat"
					bind:value={frequency}
					>{#if !editing}<option value="">Does not repeat</option>{/if}<option value="daily"
						>Daily</option
					><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option
						value="monthly">Monthly</option
					></select
				>
				{#if frequency}
					<div class="editor-fields">
						{#if frequency !== 'weekdays'}<div>
								<label for="repeat-interval">Every</label>
								<div class="repeat-interval">
									<input
										id="repeat-interval"
										type="number"
										min="1"
										max="52"
										step="1"
										required
										bind:value={interval}
									/><span
										>{frequency === 'daily'
											? 'day(s)'
											: frequency === 'weekly'
												? 'week(s)'
												: 'month(s)'}</span
									>
								</div>
							</div>{/if}
						<div>
							<label for="repeat-until">Ends on <span class="muted">· optional</span></label
							><DateTimeField
								label="repeat end date"
								id="repeat-until"
								type="date"
								bind:value={until}
								min={dueDate || '1900-01-01'}
								max="9999-12-31"
							/>
						</div>
					</div>
				{/if}
			{/if}
		</fieldset>
		{#if failure}<div class="error-message" role="alert">
				<p>{failure}</p>
				{#if editing}<button type="button" disabled={busy} onclick={reloadEdit}
						>Reload saved reminder (discard this edit)</button
					>{/if}
			</div>{/if}
		<div class="editor-actions">
			<button type="button" disabled={busy} onclick={onclose}>Cancel</button><button
				class="primary-button"
				disabled={busy}
				type="submit"
				>{busy
					? 'Saving…'
					: editing?.repeat
						? 'Update template'
						: editing
							? 'Update item'
							: frequency
								? 'Add template'
								: 'Add reminder'}</button
			>
		</div>
	</form>
	{#if editing && (!qrToken || editing.kind === 'note' || editing.repeat)}<div
			class="editor-delete"
		>
			{#if deleting}<p>
					{editing.repeat
						? 'Delete this repeating template and all future previews? Saved items will remain.'
						: 'Delete this reminder?'} This cannot be undone.
				</p>
				<div class="form-actions">
					<button class="quiet-danger" disabled={busy} onclick={remove}>Delete reminder</button
					><button disabled={busy} onclick={() => (deleting = false)}>Cancel</button>
				</div>{:else}<button class="quiet-danger" disabled={busy} onclick={() => (deleting = true)}
					>Delete reminder</button
				>{/if}
		</div>{/if}
{/snippet}
{#if inline}{@render form()}{:else}<Modal
		title={editing?.repeat
			? 'Edit template'
			: editing
				? 'Edit item'
				: frequency
					? 'Add template'
					: 'Add reminder'}
		{onclose}>{@render form()}</Modal
	>{/if}

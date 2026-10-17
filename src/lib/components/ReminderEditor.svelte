<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { Reminder, RepeatRule } from '#lib/domain.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	let {
		reminder = null,
		onsaved,
		onremoved,
		onclose,
		inline = false,
		qrToken = ''
	}: {
		reminder?: Reminder | null;
		onsaved: (item: Reminder) => void;
		onremoved: (id: string) => void;
		onclose: () => void;
		inline?: boolean;
		qrToken?: string;
	} = $props();
	const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
		n.toString(16).padStart(2, '0')
	).join('');
	let editing = $state(untrack(() => reminder));
	let kind = $state<'todo' | 'note'>(untrack(() => reminder?.kind || 'todo'));
	let title = $state(untrack(() => reminder?.title || ''));
	let notes = $state(untrack(() => reminder?.notes || ''));
	let dueDate = $state(untrack(() => reminder?.dueDate || ''));
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
	let scheduleChanged = $derived(
		!!editing?.repeat &&
			(dueDate !== editing.dueDate || JSON.stringify(repeat) !== JSON.stringify(editing.repeat))
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
						title,
						notes,
						list: 'General',
						dueDate: dueDate || null,
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
				: await api<Reminder[]>('/api/reminders');
			const latest = items.find((r) => r.id === editing?.id);
			if (!latest) {
				onremoved(editing.id);
				return;
			}
			editing = latest;
			kind = latest.kind;
			title = latest.title;
			notes = latest.notes || '';
			dueDate = latest.dueDate || '';
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
			><input
				id="reminder-date"
				type="date"
				bind:value={dueDate}
				required={!!frequency}
				min="1900-01-01"
				max="9999-12-31"
			/>
			{#if !frequency}<div class="editor-date-hint">
					{#if dueDate}<button type="button" onclick={() => (dueDate = '')}>Clear date</button>{/if}
				</div>{/if}
			<label for="reminder-repeat">Repeat</label><select id="reminder-repeat" bind:value={frequency}
				><option value="">Does not repeat</option><option value="daily">Daily</option><option
					value="weekdays">Weekdays</option
				><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select
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
						<label for="repeat-until">Ends on <span class="muted">· optional</span></label><input
							id="repeat-until"
							type="date"
							bind:value={until}
							min={dueDate || '1900-01-01'}
							max="9999-12-31"
						/>
					</div>
				</div>
			{/if}
			{#if editing?.repeat}<p class="management-hint">
					You are editing the whole repeating reminder.
				</p>{/if}
			{#if scheduleChanged}<p class="error-message">
					Changing the schedule clears the series’ completion history.
				</p>{/if}
			{#if (editing?.completedAt || Object.keys(editing?.completedDates || {}).length) && kind === 'note'}<p
					class="management-hint"
				>
					Changing this to-do into a note clears its completion history.
				</p>{/if}
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
				type="submit">{busy ? 'Saving…' : editing ? 'Update reminder' : 'Add reminder'}</button
			>
		</div>
	</form>
	{#if editing && (!qrToken || editing.kind === 'note')}<div class="editor-delete">
			{#if deleting}<p>
					{editing.repeat
						? 'Delete this repeating reminder and its completion history?'
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
		title={editing ? 'Edit reminder' : 'Add reminder'}
		{onclose}>{@render form()}</Modal
	>{/if}

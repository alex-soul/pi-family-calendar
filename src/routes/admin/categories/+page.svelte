<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { NoteCategory, Reminder } from '#lib/domain.ts';
	import { categoryColors, categoryIcons } from '#lib/categories.ts';
	import CategoryBadge from '#lib/components/CategoryBadge.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ReminderList from '#lib/components/ReminderList.svelte';
	let categories = $state<NoteCategory[]>([]),
		editing = $state<NoteCategory | null>(null),
		open = $state(false),
		deleting = $state(false),
		busy = $state(false),
		failure = $state('');
	let name = $state(''),
		color = $state(categoryColors[0]),
		icon = $state('');
	let preview = $derived<Reminder>({
		id: 'category-preview',
		kind: 'note',
		title: 'A little reminder',
		notes: 'Your note will look like this on the calendar.',
		list: 'General',
		dueDate: null,
		completedAt: null,
		version: 1,
		category: { id: 'preview', name: name.trim() || 'Your category', color, icon, version: 1 }
	});
	async function refresh() {
		categories = await api<NoteCategory[]>('/api/categories');
	}
	onMount(() => {
		void refresh().catch((e) => (failure = e.message));
	});
	function edit(c: NoteCategory | null) {
		editing = c;
		name = c?.name || '';
		color = c?.color || categoryColors[0];
		icon = c?.icon || '';
		deleting = false;
		failure = '';
		open = true;
	}
	async function save(remove = false) {
		busy = true;
		failure = '';
		try {
			await api('/api/categories', {
				method: remove ? 'DELETE' : 'POST',
				body: JSON.stringify({
					...(editing ? { id: editing.id, version: editing.version } : {}),
					name,
					color,
					icon
				})
			});
			await refresh();
			open = false;
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Note categories · Pi Family Calendar</title></svelte:head>
<main class="management">
	<header class="management-heading">
		<h1>Note categories</h1>
	</header>
	{#if failure && !open}<p role="alert">{failure}</p>{/if}
	<div class="category-list">
		{#each categories as c (c.id)}<div class="category-row">
				<div>
					{#if c.id === 'general'}<strong>General</strong>
						<p>Default · cannot be changed</p>{:else}<CategoryBadge category={c} />{/if}
				</div>
				{#if c.id !== 'general'}<button
						onclick={() => edit(c)}
						aria-label={`Edit category ${c.name}`}>Edit</button
					>{/if}
			</div>{/each}
	</div>
	<div class="category-actions">
		<button class="primary-button" onclick={() => edit(null)}
			><Icon name="plus" size={20} />Add category</button
		>
	</div>
</main>
{#if open}<Modal title={editing ? 'Edit category' : 'Add category'} onclose={() => (open = false)}>
		<form
			class="reminder-editor"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<fieldset disabled={busy}>
				<div class="category-fields">
					<div>
						<label for="category-name">Name</label><input
							id="category-name"
							bind:value={name}
							maxlength="40"
							required
						/>
					</div>
					<div>
						<label for="category-color">Colour</label>
						<div class="colour-picker">
							<input id="category-color" type="color" bind:value={color} /><span>{color}</span>
						</div>
					</div>
				</div>
				<span id="category-icon-label">Icon</span>
				<div class="icon-picker" role="group" aria-labelledby="category-icon-label">
					{#each categoryIcons as choice}
						<button
							type="button"
							aria-label={choice || 'No icon'}
							title={choice || 'No icon'}
							aria-pressed={icon === choice}
							onclick={() => (icon = choice)}><Icon name={choice || 'close'} size={23} /></button
						>
					{/each}
				</div>
				<div class="category-preview">
					<span>Card preview</span>
					<div inert>
						<ReminderList
							reminders={[preview]}
							today="2000-01-01"
							time="12:00"
							busy={null}
							ontoggle={() => {}}
							onopen={() => {}}
						/>
					</div>
				</div>
				{#if failure}<p role="alert" class="error-message">{failure}</p>
					<button
						type="button"
						onclick={async () => {
							await refresh();
							open = false;
						}}>Reload categories</button
					>{/if}
				<div class="editor-actions">
					<button type="button" onclick={() => (open = false)}>Cancel</button><button type="submit"
						>Save category</button
					>
				</div>
				{#if editing}{#if deleting}<p>
							Delete this category? All its Notes and templates, including past Notes, will move to
							General. No reminders will be deleted.
						</p>
						<button type="button" onclick={() => save(true)}>Confirm delete category</button
						>{:else}<button type="button" class="quiet-danger" onclick={() => (deleting = true)}
							>Delete category</button
						>{/if}{/if}
			</fieldset>
		</form>
	</Modal>{/if}

<style>
	.management-heading {
		margin-bottom: 24px;
	}
	.category-actions {
		margin-top: 24px;
	}
	.category-fields {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 16px;
		margin-bottom: 16px;
	}
	.category-fields > div {
		min-width: 0;
	}
	.category-fields label {
		margin-top: 0;
	}
	@media (max-width: 500px) {
		.category-fields {
			grid-template-columns: 1fr;
		}
	}
	.colour-picker {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--muted);
		font-size: 14px;
	}
	.colour-picker input {
		width: 80px;
		height: 44px;
		padding: 3px;
		cursor: pointer;
	}
	.icon-picker {
		margin: 8px 0 18px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
		gap: 6px;
	}
	.icon-picker button {
		display: grid;
		place-items: center;
		min-height: 44px;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--muted);
	}
	.icon-picker button:hover,
	.icon-picker button[aria-pressed='true'] {
		color: var(--text);
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	.icon-picker button[aria-pressed='true'] {
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.category-preview {
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--panel);
	}
	.category-preview > span {
		display: block;
		margin-bottom: 10px;
		font-size: 12px;
		color: var(--muted);
	}
	.category-list {
		display: grid;
		gap: 12px;
		max-width: 700px;
	}
	.category-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 16px;
	}
	.category-row p {
		font-size: 13px;
		color: var(--muted);
		margin: 4px 0;
	}
</style>

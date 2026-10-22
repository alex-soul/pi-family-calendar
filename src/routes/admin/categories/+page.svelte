<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { NoteCategory } from '#lib/domain.ts';
	import { categoryColors, categoryIcons } from '#lib/categories.ts';
	import CategoryBadge from '#lib/components/CategoryBadge.svelte';
	import Modal from '#lib/components/Modal.svelte';
	let categories = $state<NoteCategory[]>([]),
		editing = $state<NoteCategory | null>(null),
		open = $state(false),
		deleting = $state(false),
		busy = $state(false),
		failure = $state('');
	let name = $state(''),
		color = $state(categoryColors[0]),
		icon = $state('');
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
		<button onclick={() => edit(null)}>Add category</button>
	</header>
	<p>Categories change how Notes look. Dates, schedules and content stay the same.</p>
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
				<label for="category-name">Name</label><input
					id="category-name"
					bind:value={name}
					maxlength="40"
					required
				/>
				<label for="category-color">Colour</label><select id="category-color" bind:value={color}
					>{#each categoryColors as c, i}<option value={c}
							>{['Terracotta', 'Purple', 'Teal', 'Blue', 'Gold', 'Rose'][i]}</option
						>{/each}</select
				>
				<label for="category-icon">Icon</label><select id="category-icon" bind:value={icon}
					>{#each categoryIcons as c}<option value={c}>{c || 'None'}</option>{/each}</select
				>
				<CategoryBadge
					category={{ id: 'preview', name: name || 'Preview', color, icon, version: 1 }}
				/>
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

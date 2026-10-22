<script lang="ts">
	import type { NoteCategory } from '../domain.ts';
	import Icon from './Icon.svelte';
	let { category }: { category?: NoteCategory } = $props();
</script>

{#if category && category.id !== 'general'}<span
		class="category-badge"
		style:--category-color={category.color}
		>{#if category.icon}<Icon name={category.icon} size={14} />{/if}{category.name}</span
	>{/if}

<style>
	.category-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text);
		border-left: 3px solid var(--category-color);
		padding-left: 6px;
		margin: 3px 0;
	}
</style>

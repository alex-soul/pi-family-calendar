<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		title,
		onclose,
		children,
		wide = false
	}: { title: string; onclose: () => void; children: Snippet; wide?: boolean } = $props();
	let dialog: HTMLDialogElement;
	onMount(() => {
		dialog.showModal();
	});
</script>

<dialog bind:this={dialog!} class:wide {onclose} aria-label={title}>
	<header class="modal-heading">
		<h2>{title}</h2>
		<button class="icon-button" aria-label="Close" onclick={() => dialog.close()}
			><Icon name="close" /></button
		>
	</header>
	<div class="modal-body">{@render children()}</div>
</dialog>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		title,
		onclose,
		children,
		wide = false,
		side
	}: {
		title: string;
		onclose: () => void;
		children: Snippet;
		wide?: boolean;
		side?: Snippet;
	} = $props();
	let dialog: HTMLDialogElement;
	onMount(() => {
		dialog.showModal();
	});
</script>

<dialog bind:this={dialog!} class:wide class:with-side={!!side} {onclose} aria-label={title}>
	<header class="modal-heading">
		<h2>{title}</h2>
		<button class="icon-button" aria-label="Close" onclick={() => dialog.close()}
			><Icon name="close" /></button
		>
	</header>
	<div class="modal-content">
		<div class="modal-body">{@render children()}</div>
		{#if side}<aside class="modal-side" aria-label="Scan QR code">{@render side()}</aside>{/if}
	</div>
</dialog>

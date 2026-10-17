<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		title,
		heading,
		onclose,
		children,
		footer,
		wide = false,
		side,
		sideOpen = $bindable(false)
	}: {
		title: string;
		heading?: Snippet;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		wide?: boolean;
		side?: Snippet;
		sideOpen?: boolean;
	} = $props();
	let sideLoaded = $state(false);
	const sideId = $props.id();
	$effect(() => {
		if (sideOpen) sideLoaded = true;
	});
	let dialog: HTMLDialogElement;
	onMount(() => {
		dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog!}
	class:wide
	class:with-side={!!side}
	class:with-footer={!!footer}
	{onclose}
	aria-label={title}
>
	<header class="modal-heading">
		{#if heading}{@render heading()}{:else}<h2>{title}</h2>{/if}
		<button class="icon-button" aria-label="Close" onclick={() => dialog.close()}
			><Icon name="close" /></button
		>
	</header>
	<div class="modal-content">
		<div class="modal-body">{@render children()}</div>
		{#if side}
			<div class="modal-qr-dock" class:open={sideOpen}>
				<button
					class="modal-qr-handle"
					aria-label={sideOpen ? 'Hide QR code' : 'Show QR code'}
					aria-expanded={sideOpen}
					aria-controls={sideId}
					onclick={() => (sideOpen = !sideOpen)}><Icon name="edit" size={20} /></button
				>
				<aside id={sideId} class="modal-side" aria-label="Scan QR code" inert={!sideOpen}>
					{#if sideLoaded}{@render side()}{/if}
				</aside>
			</div>
		{/if}
	</div>
	{#if footer}<footer class="modal-footer">{@render footer()}</footer>{/if}
</dialog>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();
	let dialog: HTMLDialogElement;
	onMount(() => dialog.showModal());
</script>

<dialog class="reminder-dock" bind:this={dialog!} {onclose} aria-label="Reminders">
	<button class="dock-close icon-button" aria-label="Close reminders" onclick={() => dialog.close()}
		><Icon name="right" /></button
	>
	<div class="dock-content">{@render children()}</div>
</dialog>

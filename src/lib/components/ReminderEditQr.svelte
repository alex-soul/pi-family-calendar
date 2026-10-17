<script lang="ts">
	import ReminderQr from './ReminderQr.svelte';
	let { id }: { id: string } = $props();
	let open = $state(false);
</script>

<details class="qr-edit-disclosure" bind:open>
	<summary>Scan QR to edit</summary>
	{#if open}<ReminderQr {id} />{/if}
</details>

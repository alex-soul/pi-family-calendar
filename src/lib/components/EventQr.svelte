<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	let { id, date }: { id?: string; date?: string } = $props();
	let image = $state(''),
		failure = $state(''),
		busy = $state(false);
	async function generate() {
		if (busy || image) return;
		busy = true;
		failure = '';
		try {
			const result = await api<{ image: string; link: string }>('/api/calendar/event-qr', {
				method: 'POST',
				body: JSON.stringify(date ? { action: 'add', date } : { id })
			});
			image = result.image;
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void generate();
	});
</script>

<div class="qr-code-panel">
	{#if image}
		<img
			src={image}
			width="280"
			height="280"
			alt={date
				? 'Scan to add an event in Google Calendar'
				: 'Scan to open this event in Google Calendar'}
		/>
	{:else if busy}<p role="status">Preparing QR code…</p>
	{:else}<p role="status">{failure}</p>
		<button onclick={generate}>Try again</button>{/if}
</div>

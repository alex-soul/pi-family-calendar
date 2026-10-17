<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	let { id = null }: { id?: string | null } = $props();
	let image = $state(''),
		failure = $state(''),
		expired = $state(false),
		busy = $state(false);
	let expires = 0;
	async function generate() {
		if (busy) return;
		busy = true;
		failure = '';
		expired = false;
		image = '';
		try {
			const result = await api<{ image: string; expires: number }>('/api/qr/issue', {
				method: 'POST',
				body: JSON.stringify({ action: id ? 'edit' : 'add', id })
			});
			image = result.image;
			expires = result.expires;
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void generate();
		const timer = setInterval(() => {
			if (expires && Date.now() >= expires) expired = true;
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<div class="qr-code-panel">
	{#if image && !expired}<img
			src={image}
			width="280"
			height="280"
			alt={id ? 'Scan to edit this reminder' : 'Scan to add reminders'}
		/>
	{:else if busy}<p role="status">Preparing QR code…</p>
	{:else}<p role="status">{failure || 'QR code expired.'}</p>
		<button onclick={generate}>New QR code</button>{/if}
</div>

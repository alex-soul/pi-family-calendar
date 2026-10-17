<script lang="ts">
	import { api } from '#lib/api.ts';
	let { id }: { id: string } = $props();
	let open = $state(false),
		image = $state(''),
		link = $state(''),
		failure = $state(''),
		busy = $state(false);
	async function generate() {
		if (busy || image) return;
		busy = true;
		failure = '';
		try {
			const result = await api<{ image: string; link: string }>('/api/calendar/event-qr', {
				method: 'POST',
				body: JSON.stringify({ id })
			});
			image = result.image;
			link = result.link;
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<details
	class="qr-edit-disclosure"
	bind:open
	ontoggle={(event) => {
		if (event.currentTarget.open) void generate();
	}}
>
	<summary>Scan to open in Google Calendar</summary>
	{#if open}
		<div class="qr-code-panel">
			{#if image}
				<img
					src={image}
					width="280"
					height="280"
					alt="Scan to open this event in Google Calendar"
					onload={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
				/>
				<p>
					<a href={link} target="_blank" rel="noopener noreferrer">Open in Google Calendar ↗</a>
				</p>
			{:else if busy}<p role="status">Preparing QR code…</p>
			{:else}<p role="status">{failure}</p>
				<button onclick={generate}>Try again</button>{/if}
		</div>
	{/if}
</details>

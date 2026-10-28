<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { api } from '#lib/api.ts';
	import QrDirectLink from './QrDirectLink.svelte';
	let {
		id,
		date,
		allDay = false,
		endDate,
		actions
	}: {
		id?: string;
		date?: string;
		allDay?: boolean;
		endDate?: string;
		actions?: Snippet;
	} = $props();
	let image = $state(''),
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
				body: JSON.stringify(date ? { action: 'add', date, allDay, endDate } : { id })
			});
			image = result.image;
			link = result.link;
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
	<div class="event-dock-actions">
		{#if image}<QrDirectLink href={link} />{/if}{#if actions}{@render actions()}{/if}
	</div>
</div>

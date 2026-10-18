<script lang="ts">
	import { page } from '$app/state';
	let { href }: { href: string } = $props();
</script>

{#if href && page.url.searchParams.get('kiosk') !== '1'}
	<a class="qr-direct-link" {href} target="_blank" rel="noopener noreferrer">Direct link ↗</a>
{/if}

<style>
	.qr-direct-link {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		text-underline-offset: 0.2em;
	}
</style>

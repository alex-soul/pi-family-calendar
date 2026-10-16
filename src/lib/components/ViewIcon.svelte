<script lang="ts">
	let { view }: { view: string } = $props();
	let number = $derived(view === 'day' ? '1' : view === 'week' ? '7' : view);
</script>

<svg
	width="28"
	height="28"
	viewBox="0 0 28 28"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if view === 'schedule'}
		<rect x="4" y="4" width="20" height="5" rx="1.5" />
		<rect x="4" y="12" width="20" height="5" rx="1.5" />
		<path d="M4 23h20M9 5v3M9 13v3" />
	{:else}
		<rect x="4" y="5" width="20" height="20" rx="4" />
		<path d="M9 3v4M19 3v4" />
		{#if view === 'month'}
			<path d="M4 11h20M11 11v14M17 11v14M4 18h20" />
		{:else}
			<text
				x="14"
				y="20"
				text-anchor="middle"
				fill="currentColor"
				stroke="none"
				font-size="14"
				font-weight="600"
				font-family="inherit">{number}</text
			>
		{/if}
	{/if}
</svg>

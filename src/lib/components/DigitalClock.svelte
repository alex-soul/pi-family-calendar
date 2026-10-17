<script lang="ts">
	import FlipTile from './FlipTile.svelte';
	let { value, instant }: { value: string; instant: string } = $props();
	let parts = $derived(value.split(':'));
</script>

<time class="digital-clock" datetime={instant} aria-label={value}>
	<FlipTile value={parts[0]} /><span class="colon" aria-hidden="true">:</span>
	<FlipTile value={parts[1]} /><span class="colon" aria-hidden="true">:</span>
	<FlipTile value={parts[2]} />
</time>

<style>
	.digital-clock {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 54px;
		font:
			42px Bahnschrift,
			'SFMono-Regular',
			Consolas,
			monospace;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.colon {
		color: var(--accent);
		font-size: 24px;
		line-height: 1;
	}
	@media (max-width: 600px) {
		.digital-clock {
			font-size: 28px;
			gap: 3px;
		}
		.colon {
			font-size: 14px;
		}
	}
	@media (max-width: 380px) {
		.digital-clock {
			font-size: 23px;
		}
		.colon {
			font-size: 11px;
		}
	}
</style>

<script lang="ts">
	import { untrack } from 'svelte';
	let { value }: { value: string } = $props();
	let current = $state(untrack(() => value));
	let previous = $state(untrack(() => value));
	let animate = $state(false);
	$effect(() => {
		const next = value;
		const old = untrack(() => current);
		if (next !== old) {
			previous = old;
			current = next;
			animate = !document.hidden;
		}
	});
</script>

<span class="flip-tile" aria-hidden="true">
	<span class="half top"><span>{current}</span></span>
	<span class="half bottom"><span>{current}</span></span>
	{#key current}{#if animate}
			<span class="half top leaf"><span>{previous}</span></span>
			<span class="half bottom leaf"><span>{current}</span></span>
		{/if}{/key}
</span>

<style>
	.flip-tile {
		position: relative;
		display: block;
		width: 1.44em;
		height: 1.26em;
		perspective: 400px;
		color: #f2efe7;
		filter: drop-shadow(0 3px 3px #0003);
	}
	.half {
		position: absolute;
		left: 0;
		width: 100%;
		height: 50%;
		overflow: hidden;
		background: #293036;
		border: 1px solid #ffffff12;
	}
	.top {
		top: 0;
		border-radius: 7px 7px 0 0;
		border-bottom-color: #050709;
	}
	.bottom {
		top: 50%;
		border-radius: 0 0 7px 7px;
		background: #323b42;
	}
	.half span {
		position: absolute;
		left: 0;
		width: 100%;
		height: 1.26em;
		line-height: 1.26em;
		text-align: center;
		font-weight: 600;
		letter-spacing: -0.035em;
	}
	.bottom span {
		top: -0.63em;
	}
	.leaf {
		z-index: 1;
		backface-visibility: hidden;
	}
	.leaf.top {
		transform-origin: center bottom;
		animation: fold 180ms ease-in forwards;
	}
	.leaf.bottom {
		transform-origin: center top;
		transform: rotateX(90deg);
		animation: unfold 180ms 180ms ease-out forwards;
	}
	@keyframes fold {
		to {
			transform: rotateX(-90deg);
		}
	}
	@keyframes unfold {
		to {
			transform: rotateX(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.leaf {
			display: none;
			animation: none;
		}
	}
</style>

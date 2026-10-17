<script lang="ts">
	import { untrack } from 'svelte';
	import ViewIcon from './ViewIcon.svelte';
	let {
		view,
		collapsed = $bindable(false),
		onselect
	}: { view: string; collapsed?: boolean; onselect: (view: string) => void } = $props();
	const views = [
		['day', 'Day'],
		['2', '2 days'],
		['3', '3 days'],
		['week', '7 days'],
		['calendar-week', 'Week'],
		['month', 'Month'],
		['schedule', 'Schedule']
	];
	let container: HTMLDivElement;
	$effect(() => {
		if (collapsed)
			untrack(() => {
				if (container?.contains(document.activeElement))
					container.querySelector<HTMLButtonElement>('.active')?.focus({ preventScroll: true });
			});
	});
</script>

<div class="view-tabs adaptive" class:collapsed bind:this={container!}>
	{#each views as [id, label], index}
		<button
			class:active={view === id}
			style:--slot={index}
			aria-pressed={view === id}
			aria-expanded={view === id ? !collapsed : undefined}
			aria-label={collapsed && view === id ? `Choose view: ${label}` : label}
			title={collapsed && view === id ? `Choose view: ${label}` : label}
			inert={collapsed && view !== id}
			aria-hidden={collapsed && view !== id}
			onclick={() => {
				if (collapsed) collapsed = false;
				else onselect(id);
			}}><ViewIcon view={id} /></button
		>
	{/each}
</div>

<style>
	.adaptive {
		--size: 48px;
		--gap: 4px;
		position: relative;
		width: calc(7 * var(--size) + 6 * var(--gap) + 10px);
		height: 54px;
		transition: width 180ms ease-out;
	}
	.adaptive.collapsed {
		width: calc(var(--size) + 10px);
	}
	.adaptive button {
		position: absolute;
		top: 4px;
		left: 4px;
		width: var(--size);
		height: 44px;
		padding: 6px;
		transform: translateX(calc(var(--slot) * (var(--size) + var(--gap))));
		transition:
			transform 180ms ease-out,
			opacity 120ms ease-out;
	}
	.adaptive.collapsed button {
		transform: translateX(0);
	}
	.adaptive button.active {
		z-index: 1;
	}
	.adaptive button[aria-hidden='true'] {
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
	}
	@media (max-width: 600px) {
		.adaptive {
			--size: 40px;
			--gap: 2px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.adaptive,
		.adaptive button {
			transition: none;
		}
	}
	@media (max-width: 380px) {
		.adaptive {
			--size: 38px;
			--gap: 1px;
		}
	}
</style>

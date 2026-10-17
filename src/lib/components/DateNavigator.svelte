<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		collapsed = $bindable(false),
		current,
		month,
		onprevious,
		onnext,
		ontoday
	}: {
		collapsed?: boolean;
		current: boolean;
		month: boolean;
		onprevious: () => void;
		onnext: () => void;
		ontoday: () => void;
	} = $props();
	let container: HTMLElement;
	let todayButton: HTMLButtonElement;
	$effect(() => {
		if (collapsed)
			untrack(() => {
				if (container?.contains(document.activeElement))
					todayButton?.focus({ preventScroll: true });
			});
	});
</script>

<nav
	class="header-date-nav adaptive-dates"
	class:collapsed
	aria-label="Date navigation"
	bind:this={container!}
>
	<button
		class="icon-button previous"
		aria-label={month ? 'Previous month' : 'Previous dates'}
		title="Previous"
		inert={collapsed}
		aria-hidden={collapsed}
		onclick={onprevious}><Icon name="left" /></button
	>
	<button
		class="icon-button today"
		class:current-date={current}
		bind:this={todayButton!}
		aria-label={collapsed ? 'Show date controls' : 'Today'}
		title={collapsed ? 'Show date controls' : 'Today'}
		aria-pressed={current}
		aria-expanded={!collapsed}
		onclick={() => {
			if (collapsed) collapsed = false;
			else ontoday();
		}}><Icon name="today" /></button
	>
	<button
		class="icon-button next"
		aria-label={month ? 'Next month' : 'Next dates'}
		title="Next"
		inert={collapsed}
		aria-hidden={collapsed}
		onclick={onnext}><Icon name="right" /></button
	>
</nav>

<style>
	.adaptive-dates {
		--size: 48px;
		--gap: 4px;
		position: relative;
		width: calc(3 * var(--size) + 2 * var(--gap) + 10px);
		height: 54px;
		transition: width 180ms ease-out;
	}
	.adaptive-dates.collapsed {
		width: calc(var(--size) + 10px);
	}
	.adaptive-dates .icon-button {
		position: absolute;
		top: 4px;
		right: 4px;
		width: var(--size);
		height: 44px;
		padding: 6px;
		transition:
			transform 180ms ease-out,
			opacity 120ms ease-out;
	}
	.previous {
		transform: translateX(calc(-2 * (var(--size) + var(--gap))));
	}
	.today {
		transform: translateX(calc(-1 * (var(--size) + var(--gap))));
		z-index: 1;
	}
	.adaptive-dates.collapsed .icon-button {
		transform: translateX(0);
	}
	.icon-button[aria-hidden='true'] {
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
	}
	@media (max-width: 600px) {
		.adaptive-dates {
			--size: 40px;
			--gap: 2px;
		}
	}
	@media (max-width: 380px) {
		.adaptive-dates {
			--size: 38px;
			--gap: 1px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.adaptive-dates,
		.adaptive-dates .icon-button {
			transition: none;
		}
	}
</style>

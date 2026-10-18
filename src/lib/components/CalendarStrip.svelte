<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { addDays } from '../dates.ts';
	import { dateSwipe } from '../date-swipe.ts';
	let {
		first,
		count,
		week,
		gap,
		context,
		enabled,
		onmove,
		children
	}: {
		first: string;
		count: number;
		week: boolean;
		gap: number;
		context: string;
		enabled: boolean;
		onmove: (days: number) => void;
		children: Snippet<[string[], Map<string, number>]>;
	} = $props();
	let viewport: HTMLDivElement;
	let width = $state(0);
	let active = $state(false);
	let settling = $state(false);
	let offset = $state(0);
	let positions = $state<Map<string, number>>(new Map());
	let generation = 0;
	let rebasing = false;
	let animation: Animation | undefined;
	let track: HTMLDivElement;
	let reduced = $state(false);
	let horizontal = $state(false);
	const pageCount = $derived(week ? 3 : Math.ceil(3 / count));
	const stride = $derived(width + gap);
	const step = $derived(week ? stride : stride / count);
	const pages = $derived(
		Array.from({ length: active ? pageCount * 2 + 1 : 1 }, (_, i) => {
			const index = active ? i - pageCount : 0;
			return {
				index,
				first: addDays(first, index * count),
				dates: Array.from({ length: count }, (_, d) => addDays(first, index * count + d))
			};
		})
	);
	function clear() {
		generation++;
		animation?.cancel();
		animation = undefined;
		active = settling = false;
		offset = 0;
		positions = new Map();
	}
	async function settle(steps: number) {
		if (!active || settling) return;
		settling = true;
		const run = ++generation;
		await tick();
		if (run !== generation) return;
		const destination = -steps * step;
		if (!reduced && Math.abs(destination - offset) > 1) {
			animation = track.animate(
				[
					{ transform: `translate3d(${offset}px,0,0)` },
					{ transform: `translate3d(${destination}px,0,0)` }
				],
				{
					duration: Math.min(420, 180 + Math.abs(destination - offset) * 0.15),
					easing: 'cubic-bezier(.2,.75,.25,1)',
					fill: 'forwards'
				}
			);
			try {
				await animation.finished;
			} catch {
				return;
			}
		}
		if (run !== generation) return;
		// Carry the visible days' vertical positions across the strip's date rebase.
		positions = new Map(
			Array.from(viewport.querySelectorAll<HTMLElement>('.agenda-scroll, .week-events')).map(
				(n) => [n.dataset.scrollDate || '', n.scrollTop]
			)
		);
		rebasing = true;
		if (steps) onmove(steps * (week ? 7 : 1));
		active = false;
		offset = 0;
		animation?.cancel();
		animation = undefined;
		await tick();
		rebasing = false;
		// followCurrent queues its initial position in an animation frame.
		requestAnimationFrame(() => {
			if (run !== generation) return;
			for (const n of viewport.querySelectorAll<HTMLElement>('.agenda-scroll, .week-events')) {
				const saved = positions.get(n.dataset.scrollDate || '');
				if (saved !== undefined) n.scrollTop = saved;
			}
			settling = false;
		});
	}
	onMount(() => {
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		const layout = matchMedia('(min-width: 601px)');
		const layoutChange = () => {
			horizontal = layout.matches;
			clear();
		};
		layoutChange();
		layout.addEventListener('change', layoutChange);
		const change = () => {
			reduced = media.matches;
		};
		change();
		media.addEventListener('change', change);
		const observer = new ResizeObserver((entries) => {
			const next = entries[0].contentRect.width;
			if (width && Math.abs(next - width) > 1) clear();
			width = next;
		});
		observer.observe(viewport);
		return () => {
			clear();
			observer.disconnect();
			media.removeEventListener('change', change);
			layout.removeEventListener('change', layoutChange);
		};
	});
	$effect(() => {
		first;
		context;
		untrack(() => {
			if (!rebasing) clear();
		});
	});
	$effect(() => {
		if (!enabled) clear();
	});
</script>

<div
	class="date-viewport"
	class:sliding={active}
	bind:this={viewport!}
	use:dateSwipe={{
		key: `${context}:${first}`,
		enabled: enabled && !settling && horizontal && width > 0,
		width: step,
		onstart: () => {
			active = true;
		},
		onshift: (x) => {
			offset = reduced ? 0 : x;
		},
		onrelease: (steps) => {
			void settle(steps);
		},
		oncancel: () => {
			void settle(0);
		}
	}}
>
	<div class="date-strip" bind:this={track!} style:transform={`translate3d(${offset}px,0,0)`}>
		{#each pages as page (page.first)}
			<div
				class="date-strip-page"
				class:neighbor={page.index !== 0}
				inert={page.index !== 0}
				aria-hidden={page.index !== 0}
				style:left={`${page.index * stride}px`}
			>
				{@render children(page.dates, positions)}
			</div>
		{/each}
	</div>
</div>

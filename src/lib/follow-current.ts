import { tick } from 'svelte';

/** Scroll only on an explicit focus request, never on a clock render or user scroll. */
type FocusRequest = number | { token: number; initialScroll?: number };
export function followCurrent(node: HTMLElement, initial: FocusRequest) {
	let token = typeof initial === 'number' ? initial : initial.token;
	let initialScroll = typeof initial === 'number' ? undefined : initial.initialScroll;
	let frame = 0;
	let disposed = false;
	function position() {
		if (disposed) return;
		node.style.setProperty('--scroll-tail', `${Math.max(0, node.clientHeight - 90)}px`);
		if (initialScroll !== undefined) {
			node.scrollTo({ top: initialScroll, behavior: 'instant' });
			return;
		}
		const target = node.querySelector<HTMLElement>('[data-current="true"]');
		if (target) {
			const offset = target.getBoundingClientRect().top - node.getBoundingClientRect().top;
			node.scrollTo({ top: node.scrollTop + offset - node.clientTop, behavior: 'instant' });
		} else node.scrollTo({ top: 0, behavior: 'instant' });
	}
	async function schedule() {
		await tick();
		if (disposed) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(position);
	}
	const observer = new ResizeObserver(schedule);
	observer.observe(node);
	void schedule();
	return {
		update(next: FocusRequest) {
			const nextToken = typeof next === 'number' ? next : next.token;
			initialScroll = typeof next === 'number' ? undefined : next.initialScroll;
			if (nextToken !== token) {
				token = nextToken;
				void schedule();
			}
		},
		destroy() {
			disposed = true;
			cancelAnimationFrame(frame);
			observer.disconnect();
		}
	};
}

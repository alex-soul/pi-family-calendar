import { tick } from 'svelte';

/** Scroll only on an explicit focus request, never on a clock render or user scroll. */
export function followCurrent(node: HTMLElement, initial: number) {
	let token = initial;
	let frame = 0;
	let disposed = false;
	function position() {
		if (disposed) return;
		node.style.setProperty('--scroll-tail', `${Math.max(0, node.clientHeight - 90)}px`);
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
		update(next: number) {
			if (next !== token) {
				token = next;
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

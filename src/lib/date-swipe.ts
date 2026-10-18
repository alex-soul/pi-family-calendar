/** Snap to the nearest date, with a short bounded projection for a release flick. */
export function swipeSteps(dx: number, dy: number, velocity: number, width = 180): number {
	if (
		width <= 0 ||
		!Number.isFinite(width) ||
		Math.abs(dx) < 16 ||
		Math.abs(dx) < Math.abs(dy) * 1.5
	)
		return 0;
	// A final reversal brakes a swipe instead of adding momentum in the old direction.
	const projected = dx + (Math.sign(dx) === Math.sign(velocity) ? velocity * 180 : 0);
	const steps = Math.min(3, Math.floor(Math.abs(projected) / width + 0.5));
	return steps ? -Math.sign(dx) * steps : 0;
}

type Options = {
	key: string;
	enabled: boolean;
	width: number;
	onstart: () => void;
	onshift: (pixels: number) => void;
	onrelease: (steps: number) => void;
	oncancel: () => void;
};

/** Touch navigation starts only on empty background at the foot of the event region. */
export function dateSwipe(node: HTMLElement, options: Options) {
	let gesture: {
		id: number;
		x: number;
		y: number;
		locked: boolean;
		samples: { x: number; time: number }[];
	} | null = null;
	let suppressClick = false;
	let clickTimer: ReturnType<typeof setTimeout>;
	function reset() {
		const held = gesture;
		gesture = null;
		if (held && node.hasPointerCapture(held.id)) node.releasePointerCapture(held.id);
	}
	function abort() {
		if (gesture) {
			reset();
			options.oncancel();
		}
	}
	function down(e: PointerEvent) {
		if (gesture) {
			abort();
			return;
		}
		suppressClick = false;
		clearTimeout(clickTimer);
		if (!options.enabled || !e.isPrimary || e.pointerType === 'mouse') return;
		const target = e.target;
		if (
			!(target instanceof HTMLElement) ||
			!target.matches(
				'.agenda-scroll, .card-stack, .scroll-tail, .agenda-end, .week-events, .week-empty'
			)
		)
			return;
		const region = target.closest<HTMLElement>('.agenda-scroll, .week-events');
		if (!region) return;
		const bounds = region.getBoundingClientRect();
		if (
			e.clientY < bounds.bottom - Math.min(160, bounds.height * 0.3) ||
			e.clientX >= bounds.right - 14 ||
			e.clientY > bounds.bottom
		)
			return;
		gesture = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			locked: false,
			samples: [{ x: e.clientX, time: e.timeStamp }]
		};
	}
	function move(e: PointerEvent) {
		if (!gesture || gesture.id !== e.pointerId) return;
		const dx = e.clientX - gesture.x,
			dy = e.clientY - gesture.y;
		if (!gesture.locked) {
			if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
				abort();
				return;
			}
			if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
			gesture.locked = true;
			node.setPointerCapture(e.pointerId);
			options.onstart();
		}
		e.preventDefault();
		gesture.samples.push({ x: e.clientX, time: e.timeStamp });
		gesture.samples = gesture.samples.filter((s) => e.timeStamp - s.time <= 100);
		options.onshift(Math.max(-3 * options.width, Math.min(3 * options.width, dx)));
	}
	function up(e: PointerEvent) {
		if (!gesture || gesture.id !== e.pointerId) return;
		const g = gesture;
		const sample = g.samples.find((s) => e.timeStamp - s.time <= 100);
		const velocity = sample ? (e.clientX - sample.x) / Math.max(1, e.timeStamp - sample.time) : 0;
		const steps = g.locked
			? swipeSteps(e.clientX - g.x, e.clientY - g.y, velocity, options.width)
			: 0;
		reset();
		if (g.locked) {
			suppressClick = true;
			clickTimer = setTimeout(() => {
				suppressClick = false;
			}, 400);
			options.onrelease(steps);
		}
	}
	function cancel(e: PointerEvent) {
		if (e.type === 'lostpointercapture' && e.target !== node) return;
		if (gesture?.id === e.pointerId) abort();
	}
	function click(e: MouseEvent) {
		if (suppressClick) {
			e.preventDefault();
			e.stopImmediatePropagation();
			suppressClick = false;
		}
	}
	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move, { passive: false });
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('lostpointercapture', cancel);
	node.addEventListener('click', click, true);
	return {
		update(next: Options) {
			if (next.key !== options.key || next.width !== options.width || !next.enabled) abort();
			options = next;
		},
		destroy() {
			reset();
			clearTimeout(clickTimer);
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('lostpointercapture', cancel);
			node.removeEventListener('click', click, true);
		}
	};
}

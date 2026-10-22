<script lang="ts">
	import { categoryIconPaths } from '../category-icons.ts';
	let { name, size = 22 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		...categoryIconPaths,
		eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
		gift: 'M3 8h18v4H3V8ZM5 12v9h14v-9M12 8v13M12 8C3 8 5 1 9 4l3 4Zm0 0c9 0 7-7 3-4l-3 4Z',
		star: 'm12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7Z',
		heart: 'M20 4c-3-2-6 0-8 3-2-3-5-5-8-3-6 5 4 13 8 17 4-4 14-12 8-17Z',
		info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7h.01',
		sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
		moon: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z',
		lock: 'M6 10h12v11H6V10ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
		layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
		home: 'm3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',
		server: 'M4 3h16v7H4V3ZM4 14h16v7H4v-7ZM7 6h1M7 17h1M12 6h5M12 17h5',
		left: 'm14 6-6 6 6 6',
		sync: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M18 17a7 7 0 0 1-12 2l-2-2',
		search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		note: 'M5 3h14v14l-4 4H5V3ZM14 21v-5h5M8 8h8M8 12h6',
		edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
		right: 'm10 6 6 6-6 6',
		close: 'm6 6 12 12M6 18 18 6',
		square: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z',
		check: 'm5 12 4 4L19 6',
		repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3',
		menu: 'M4 6h16M4 12h16M4 18h16',
		list: 'M9 6h11M9 12h11M9 18h11M3 6h1M3 12h1M3 18h1',
		today:
			'M8 3v4M16 3v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM10 14h4v3h-4Z',
		calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
		settings:
			'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
		plus: 'M12 5v14M5 12h14',
		undo: 'M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5',
		location: 'M12 22s8-8 8-14A8 8 0 0 0 4 8c0 6 8 14 8 14ZM12 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name] || paths.calendar} /></svg
>

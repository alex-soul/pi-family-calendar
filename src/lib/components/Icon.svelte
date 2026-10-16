<script lang="ts">
	let { name, size = 22 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		left: 'm14 6-6 6 6 6',
		sync: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M18 17a7 7 0 0 1-12 2l-2-2',
		search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		note: 'M5 3h14v14l-4 4H5V3ZM14 21v-5h5M8 8h8M8 12h6',
		edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
		right: 'm10 6 6 6-6 6',
		close: 'm6 6 12 12M6 18 18 6',
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

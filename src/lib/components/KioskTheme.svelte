<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '../api.ts';
	let { token, theme = $bindable('dark') }: { token: string; theme: 'warm' | 'dark' } = $props();
	onMount(() => {
		let stopped = false,
			busy = false,
			revision = -1;
		const sync = async () => {
			if (stopped || busy) return;
			busy = true;
			try {
				const sentTheme = theme;
				// Prove persistence before reporting application; an unwritable profile is unavailable.
				const prefs = JSON.parse(
					localStorage.getItem('calendar-kiosk-display-v1') ||
						localStorage.getItem('calendar-display-v1') ||
						'{}'
				);
				localStorage.setItem('calendar-kiosk-display-v1', JSON.stringify({ ...prefs, theme }));
				const result = await api<{ theme: 'warm' | 'dark'; revision: number }>('/api/kiosk-theme', {
					method: 'POST',
					headers: { Authorization: `Bearer ${token}` },
					body: JSON.stringify({ theme, revision, ready: !document.hidden })
				});
				if (!stopped && theme === sentTheme) {
					localStorage.setItem(
						'calendar-kiosk-display-v1',
						JSON.stringify({
							...JSON.parse(localStorage.getItem('calendar-kiosk-display-v1') || '{}'),
							theme: result.theme
						})
					);
					theme = result.theme;
				}
				if (!stopped) revision = result.revision;
			} catch {
				/* No false acknowledgement; host marks the missing heartbeat unavailable. */
			} finally {
				busy = false;
			}
		};
		void sync();
		const timer = setInterval(sync, 1000);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	});
</script>

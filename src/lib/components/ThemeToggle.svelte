<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	let theme = $state<'dark' | 'warm'>('dark');
	onMount(() => {
		theme = document.documentElement.dataset.theme === 'warm' ? 'warm' : 'dark';
	});
	function toggle() {
		theme = theme === 'dark' ? 'warm' : 'dark';
		document.documentElement.dataset.theme = theme;
		let preferences = {};
		try {
			const saved = JSON.parse(localStorage.getItem('calendar-display-v1') || '{}');
			if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
		} catch {
			/* Optional browser preferences. */
		}
		try {
			localStorage.setItem('calendar-display-v1', JSON.stringify({ ...preferences, theme }));
		} catch {
			/* Theme remains usable when storage is unavailable. */
		}
	}
</script>

<button
	class="admin-theme-button icon-button"
	aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	onclick={toggle}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} /></button
>

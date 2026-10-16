<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
	onMount(() => {
		try {
			const { theme } = JSON.parse(localStorage.getItem('calendar-display-v1') || '{}');
			document.documentElement.dataset.theme =
				theme === 'dark' || theme === 'slate' ? 'dark' : 'warm';
		} catch {
			/* Keep the default theme when storage is unavailable. */
		}
	});
</script>

<div class="manage-shell">
	<header class="manage-topbar">
		<a class="back-link" href="/"><Icon name="left" size={18} />Calendar</a><span
			>Manage your calendar</span
		>
	</header>
	<nav class="manage-nav" aria-label="Management">
		<a href="/manage" aria-current={page.url.pathname === '/manage' ? 'page' : undefined}
			><Icon name="list" size={20} />Reminders</a
		>
		<a
			href="/manage/google"
			aria-current={page.url.pathname.startsWith('/manage/google') ? 'page' : undefined}
			><Icon name="calendar" size={20} />Google Calendar</a
		>
	</nav>
	{@render children()}
</div>

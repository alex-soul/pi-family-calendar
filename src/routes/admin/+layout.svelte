<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { api } from '#lib/api.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	let busy = $state(false),
		failure = $state('');
	const links = [
		{ href: '/admin', name: 'Overview', icon: 'home' },
		{ href: '/admin/reminders', name: 'Reminders', icon: 'list' },
		{ href: '/admin/google', name: 'Google Calendar', icon: 'calendar' },
		{ href: '/admin/settings', name: 'Access & system', icon: 'lock' }
	];
	async function lock() {
		busy = true;
		failure = '';
		try {
			await api('/api/admin/session', { method: 'POST', body: JSON.stringify({ action: 'lock' }) });
			window.location.assign('/admin/login');
		} catch (cause) {
			failure = (cause as Error).message;
			busy = false;
		}
	}
	onMount(() => {
		try {
			const { theme } = JSON.parse(localStorage.getItem('calendar-display-v1') || '{}');
			document.documentElement.dataset.theme =
				theme === 'dark' || theme === 'slate' ? 'dark' : 'warm';
		} catch {
			/* Optional preference. */
		}
	});
</script>

{#if page.url.pathname === '/admin/login'}{@render children()}{:else}
	<div class="admin-shell">
		<header class="admin-header">
			<a class="admin-brand" href="/admin"
				><span class="admin-mark"><Icon name="calendar" size={24} /></span><span
					>Family Calendar<small>Administration</small></span
				></a
			>
			<div class="admin-header-actions">
				<a class="secondary-link" href="/">View calendar<Icon name="right" size={18} /></a
				>{#if data.pinEnabled}<button class="admin-lock" disabled={busy} onclick={lock}
						><Icon name="lock" size={18} />Lock</button
					>{/if}
			</div>
		</header>
		<nav class="admin-navigation" aria-label="Admin navigation">
			{#each links as link}<a
					href={link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					><Icon name={link.icon} size={20} /><span>{link.name}</span></a
				>{/each}
		</nav>
		<div class="admin-content">
			{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}{@render children()}
		</div>
		<footer class="admin-footer">
			Installation settings live here. Display preferences stay on each screen.
		</footer>
	</div>{/if}

<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	let mobileMenu = $state(false);
	let menuButton = $state<HTMLButtonElement>();
	afterNavigate(() => (mobileMenu = false));
	let busy = $state(false),
		failure = $state('');
	const links = [
		{ href: '/admin', name: 'Overview', icon: 'home' },
		{ href: '/admin/reminders', name: 'Reminders', icon: 'list' },
		{ href: '/admin/categories', name: 'Note categories', icon: 'layers' },
		{ href: '/admin/google', name: 'Google Calendar', icon: 'calendar' },
		{ href: '/admin/screen', name: 'Screen', icon: 'sun' },
		{ href: '/admin/access', name: 'Access', icon: 'lock' },
		{ href: '/admin/system', name: 'System', icon: 'server' },
		{ href: '/admin/about', name: 'About', icon: 'info' }
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
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && mobileMenu) {
			mobileMenu = false;
			menuButton?.focus();
		}
	}}
/>

{#if page.url.pathname === '/admin/login'}
	<div class="admin-login-theme"><ThemeToggle /></div>
	{@render children()}{:else}
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
			<div class="admin-header-controls">
				<ThemeToggle />
				<button
					class="admin-menu-button icon-button"
					bind:this={menuButton}
					aria-label="Admin menu"
					aria-expanded={mobileMenu}
					aria-controls="admin-navigation"
					onclick={() => (mobileMenu = !mobileMenu)}><Icon name="menu" size={24} /></button
				>
			</div>
		</header>
		<nav
			id="admin-navigation"
			class="admin-navigation"
			class:open={mobileMenu}
			aria-label="Admin navigation"
		>
			{#each links as link}<a
					href={link.href}
					aria-current={page.url.pathname === link.href ? 'page' : undefined}
					><Icon name={link.icon} size={20} /><span>{link.name}</span></a
				>{/each}
			<div class="admin-mobile-actions">
				<a href="/" class="secondary-link"><Icon name="right" size={20} />View calendar</a>
				{#if data.pinEnabled}<button class="admin-lock" disabled={busy} onclick={lock}
						><Icon name="lock" size={20} />Lock admin</button
					>{/if}
			</div>
		</nav>
		<div class="admin-content">
			{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}{@render children()}
		</div>
	</div>{/if}

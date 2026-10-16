<script lang="ts">
	import { api } from '#lib/api.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let pin = $state(''),
		failure = $state(''),
		busy = $state(false);
	async function unlock(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = '';
		try {
			await api('/api/admin/session', {
				method: 'POST',
				body: JSON.stringify({ action: 'unlock', pin })
			});
			pin = '';
			window.location.assign(data.next);
		} catch (cause) {
			failure = (cause as Error).message;
			pin = '';
			busy = false;
		}
	}
</script>

<svelte:head><title>Unlock admin · Pi Family Calendar</title></svelte:head>
<main class="admin-login">
	<form class="admin-login-card" onsubmit={unlock}>
		<span class="admin-card-icon"><Icon name="lock" size={30} /></span><span class="eyebrow"
			>FAMILY CALENDAR</span
		>
		<h1>Welcome back.</h1>
		<p>Enter your PIN to open administration.</p>
		<label for="admin-pin">Admin PIN</label><input
			id="admin-pin"
			type="password"
			inputmode="numeric"
			pattern={'[0-9]{6,12}'}
			minlength="6"
			maxlength="12"
			autocomplete="current-password"
			required
			bind:value={pin}
		/>{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}<button
			class="primary-button"
			disabled={busy}>{busy ? 'Unlocking…' : 'Unlock admin'}</button
		><a class="back-link" href="/"><Icon name="left" size={18} />Back to calendar</a>
		<details class="management-about">
			<summary>Forgot your PIN?</summary>
			<p>
				The installation owner can reset access from the host. See the project’s admin guide. There
				is no display-side reset.
			</p>
		</details>
	</form>
</main>

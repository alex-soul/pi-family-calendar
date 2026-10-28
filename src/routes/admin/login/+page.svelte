<script lang="ts">
	import PinInput from '#lib/components/PinInput.svelte';
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
		<PinInput id="admin-pin" label="Admin PIN" bind:value={pin} legacy />{#if failure}<p
				class="error-message"
				role="alert"
			>
				{failure}
			</p>{/if}<button
			class="primary-button"
			class:pin-ready={pin.length >= 6}
			disabled={busy || pin.length < 6}>{busy ? 'Unlocking…' : 'Unlock admin'}</button
		><a class="back-link" href="/"><Icon name="left" size={18} />Back to calendar</a>
		<details class="management-about">
			<summary>Forgot your PIN?</summary>
			<p>
				The installation owner can disable a forgotten PIN over SSH, then set a new one. See the <a
					href="https://github.com/alex-soul/pi-family-calendar/blob/main/docs/admin.md#forgotten-pin-installation-owner-only"
					target="_blank"
					rel="noopener noreferrer">recovery guide</a
				>.
			</p>
		</details>
	</form>
</main>

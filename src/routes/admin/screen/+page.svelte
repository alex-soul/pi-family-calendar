<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { ApplianceStatus, DisplayState } from '#lib/server/appliance.ts';
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let appliance = $state(untrack(() => data.appliance));
	let brightness = $state(untrack(() => data.appliance.display?.brightness ?? 70));
	let idleMinutes = $state(untrack(() => data.appliance.display?.idleMinutes ?? 10));
	let autoBlank = $state(untrack(() => data.appliance.display?.autoBlank ?? true));
	let dirty = $state(false),
		busy = $state(false),
		failure = $state(''),
		saved = $state('');
	function populate(display: DisplayState | null) {
		if (display && !dirty) ({ brightness, idleMinutes, autoBlank } = display);
	}
	async function refresh() {
		try {
			appliance = await api<ApplianceStatus>('/api/admin/appliance');
			populate(appliance.display);
		} catch {
			appliance = { state: 'unavailable', host: null, display: null, powerEnabled: false };
		}
	}
	async function action(action: 'settings' | 'wake' | 'sleep') {
		busy = true;
		failure = '';
		saved = '';
		try {
			const display = await api<DisplayState>('/api/admin/appliance', {
				method: 'POST',
				body: JSON.stringify({
					kind: 'display',
					request: {
						action,
						...(action === 'settings' ? { settings: { brightness, idleMinutes, autoBlank } } : {})
					}
				})
			});
			appliance = { ...appliance, display };
			if (action === 'settings') {
				dirty = false;
				populate(display);
				saved = 'Saved.';
			}
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		const timer = setInterval(() => {
			if (!document.hidden && !busy) void refresh();
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Screen · Pi Family Calendar</title></svelte:head>
<main class="management admin-settings screen-page">
	<header class="manage-page-heading">
		<h1>Screen</h1>
		<button class="icon-button" aria-label="Refresh screen status" onclick={refresh}
			><Icon name="sync" /></button
		>
	</header>
	{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}
	<section class="management-card">
		{#if appliance.display}
			<div class="screen-state">
				<Icon name={appliance.display.awake ? 'sun' : 'moon'} size={28} /><strong
					>{appliance.display.awake ? 'Screen is on' : 'Screen is sleeping'}</strong
				>
			</div>
			{#if !appliance.display.wakeMonitor}<p class="error-message">
					Local wake monitor unavailable.
				</p>{/if}
			<div class="screen-buttons">
				<button disabled={busy} onclick={() => action('wake')}
					><Icon name="sun" size={18} />Wake</button
				><button disabled={busy || !appliance.display.wakeMonitor} onclick={() => action('sleep')}
					><Icon name="moon" size={18} />Sleep</button
				>
			</div>
		{:else}<p>
				{appliance.state === 'not-configured'
					? 'Device controls are not configured.'
					: 'Display controller unavailable.'}
			</p>{/if}
	</section>
	{#if appliance.display}<form
			class="management-card screen-form"
			onsubmit={(event) => {
				event.preventDefault();
				void action('settings');
			}}
		>
			<fieldset disabled={busy || !appliance.display.wakeMonitor}>
				<label for="brightness">Brightness <span>{brightness}%</span></label>
				<input
					id="brightness"
					type="range"
					min="10"
					max="100"
					step="1"
					bind:value={brightness}
					oninput={() => (dirty = true)}
				/>
				<label class="screen-toggle" for="auto-blank"
					><span>Automatic blanking</span><input
						id="auto-blank"
						type="checkbox"
						bind:checked={autoBlank}
						onchange={() => (dirty = true)}
					/></label
				>
				<label for="screen-idle">Idle timeout · minutes</label>
				<input
					id="screen-idle"
					type="number"
					min="1"
					max="120"
					step="1"
					required
					bind:value={idleMinutes}
					oninput={() => (dirty = true)}
				/>
				<button class="primary-button" disabled={!dirty}>Save</button>
			</fieldset>
			{#if saved}<p role="status">{saved}</p>{/if}
		</form>{/if}
</main>

<style>
	.screen-page .manage-page-heading {
		flex-direction: row;
		align-items: center;
	}
	.screen-state,
	.screen-buttons,
	.screen-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.screen-buttons {
		margin-top: 1.5rem;
	}
	.screen-buttons button {
		flex: 1;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 10px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
		min-width: 0;
	}
	label {
		margin: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	input[type='range'] {
		width: 100%;
		padding: 0;
		min-height: 44px;
	}
	input[type='checkbox'] {
		width: 24px;
		height: 24px;
		min-height: 24px;
		accent-color: var(--accent);
	}
	input[type='number'] {
		width: 100%;
		box-sizing: border-box;
	}
	.screen-toggle {
		padding-block: 0.5rem;
	}
</style>

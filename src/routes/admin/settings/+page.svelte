<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { api } from '#lib/api.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let currentPin = $state(''),
		newPin = $state(''),
		confirmPin = $state(''),
		busy = $state(false),
		failure = $state(''),
		message = $state(''),
		removing = $state(false);
	async function save(disable = false) {
		if (busy) return;
		failure = '';
		message = '';
		if (!disable && newPin !== confirmPin) {
			failure = 'The new PINs do not match.';
			return;
		}
		busy = true;
		try {
			await api('/api/admin/pin', {
				method: 'POST',
				body: JSON.stringify({ currentPin, newPin: disable ? null : newPin })
			});
			currentPin = '';
			newPin = '';
			confirmPin = '';
			removing = false;
			await invalidateAll();
			message = disable
				? 'PIN protection disabled.'
				: 'PIN protection saved. Other admin sessions have been locked.';
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Access & system · Pi Family Calendar</title></svelte:head>
<main class="management admin-settings">
	<header class="manage-page-heading">
		<div>
			<h1>Access & system</h1>
		</div>
	</header>
	<details class="management-card admin-security connection-help">
		<summary
			>Admin PIN
			<span class="admin-badge">{data.pinEnabled ? 'On' : 'Off'}</span>
		</summary>
		<p>
			{data.pinEnabled
				? 'This admin portal and its editing APIs require an unlocked session.'
				: 'Anyone who can reach this installation and knows /admin can manage it. Enable a PIN to restrict access.'}
		</p>
		<form
			class="admin-pin-form"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<fieldset disabled={busy}>
				{#if data.pinEnabled}<label for="current-pin">Current PIN</label><input
						id="current-pin"
						type="password"
						inputmode="numeric"
						pattern={'[0-9]{6,12}'}
						minlength="6"
						maxlength="12"
						autocomplete="current-password"
						bind:value={currentPin}
						required
					/>{/if}
				<div class="editor-fields">
					<div>
						<label for="new-pin">{data.pinEnabled ? 'New PIN' : 'Choose a PIN'}</label><input
							id="new-pin"
							type="password"
							inputmode="numeric"
							pattern={'[0-9]{6,12}'}
							minlength="6"
							maxlength="12"
							autocomplete="new-password"
							bind:value={newPin}
							required
						/>
					</div>
					<div>
						<label for="confirm-pin">Confirm PIN</label><input
							id="confirm-pin"
							type="password"
							inputmode="numeric"
							pattern={'[0-9]{6,12}'}
							minlength="6"
							maxlength="12"
							autocomplete="new-password"
							bind:value={confirmPin}
							required
						/>
					</div>
				</div>
				<p class="management-hint">
					6–12 digits. An unlocked session lasts 12 hours; use Lock when finished. The calendar
					stays available, including to-do completion.
				</p>
				<button class="primary-button" type="submit" disabled={busy}
					>{busy ? 'Saving…' : data.pinEnabled ? 'Update PIN' : 'Enable PIN'}</button
				>
			</fieldset>
		</form>
		{#if data.pinEnabled}<div class="editor-delete">
				{#if removing}<p>
						Disable protection for everyone who can reach this installation? Enter your current PIN
						above to confirm.
					</p>
					<div class="form-actions">
						<button class="quiet-danger" disabled={busy || !currentPin} onclick={() => save(true)}
							>Disable PIN</button
						><button disabled={busy} onclick={() => (removing = false)}>Cancel</button>
					</div>{:else}<button class="quiet-danger" onclick={() => (removing = true)}
						>Disable PIN protection</button
					>{/if}
			</div>{/if}
		{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}{#if message}<p
				class="success-message"
				role="status"
			>
				{message}
			</p>{/if}
	</details>
	<details class="management-card connection-help">
		<summary>System</summary>
		<dl class="admin-system">
			<div>
				<dt>Version</dt>
				<dd>{data.version}</dd>
			</div>
			<div>
				<dt>Time zone</dt>
				<dd>{data.timeZone}</dd>
			</div>
			<div>
				<dt>Calendar access</dt>
				<dd>Google · read-only</dd>
			</div>
			<div>
				<dt>Reminders</dt>
				<dd>Local storage · General</dd>
			</div>
			<div>
				<dt>Network</dt>
				<dd>Local preview only</dd>
			</div>
		</dl>
		<p class="management-hint">
			Time zone is set in the installation configuration. LAN access and backup/recovery tooling are
			still to come.
		</p>
	</details>
</main>

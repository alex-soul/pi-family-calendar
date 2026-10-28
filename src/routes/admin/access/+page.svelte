<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PinInput from '#lib/components/PinInput.svelte';
	import { api } from '#lib/api.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let eventBusy = $state(false),
		eventFailure = $state('');
	async function saveEventQr(enabled: boolean, calendarId: string) {
		eventBusy = true;
		eventFailure = '';
		try {
			await api('/api/admin/event-qr', {
				method: 'POST',
				body: JSON.stringify({ enabled, calendarId })
			});
			await invalidateAll();
		} catch (cause) {
			eventFailure = (cause as Error).message;
		} finally {
			eventBusy = false;
		}
	}
	let qrBusy = $state(false),
		qrFailure = $state('');
	async function toggleQr() {
		qrBusy = true;
		qrFailure = '';
		try {
			await api('/api/admin/qr', {
				method: 'POST',
				body: JSON.stringify({ enabled: !data.qrEnabled })
			});
			await invalidateAll();
		} catch (cause) {
			qrFailure = (cause as Error).message;
		} finally {
			qrBusy = false;
		}
	}
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
		if (data.pinEnabled && !/^[0-9]{6,12}$/.test(currentPin)) {
			failure = 'Enter your current PIN.';
			return;
		}
		if (!disable && (!/^[0-9]{6}$/.test(newPin) || !/^[0-9]{6}$/.test(confirmPin))) {
			failure = 'Use exactly 6 digits.';
			return;
		}
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

<svelte:head><title>Access · Pi Family Calendar</title></svelte:head>
<main class="management admin-settings">
	<header class="manage-page-heading">
		<div>
			<h1>Access</h1>
		</div>
	</header>
	<details class="management-card admin-security connection-help">
		<summary
			>Admin PIN
			<span class="admin-badge">{data.pinEnabled ? 'On' : 'Off'}</span>
		</summary>
		<form
			class="admin-pin-form"
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<fieldset disabled={busy}>
				{#if data.pinEnabled}<PinInput
						id="current-pin"
						label="Current PIN"
						bind:value={currentPin}
						legacy
					/>{/if}
				<div class="editor-fields">
					<div>
						<PinInput
							id="new-pin"
							label={data.pinEnabled ? 'New PIN' : 'Choose a PIN'}
							bind:value={newPin}
							autocomplete="new-password"
						/>
					</div>
					<div>
						<PinInput
							id="confirm-pin"
							label="Confirm PIN"
							bind:value={confirmPin}
							autocomplete="new-password"
						/>
					</div>
				</div>
				<button
					class="primary-button"
					class:pin-ready={newPin.length === 6 &&
						confirmPin === newPin &&
						(!data.pinEnabled || currentPin.length >= 6)}
					type="submit"
					disabled={busy}>{busy ? 'Saving…' : data.pinEnabled ? 'Update PIN' : 'Enable PIN'}</button
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
		<summary>QR reminders <span class="admin-badge">{data.qrEnabled ? 'On' : 'Off'}</span></summary>
		<div class="qr-setting">
			<span>Manage reminders via QR codes</span><button
				class="qr-switch"
				role="switch"
				aria-checked={data.qrEnabled}
				aria-label="Manage reminders via QR codes"
				disabled={qrBusy}
				onclick={toggleQr}><span></span></button
			>
		</div>
		{#if qrFailure}<p class="error-message" role="alert">{qrFailure}</p>{/if}
	</details>

	<details class="management-card connection-help">
		<summary
			>QR calendar events <span class="admin-badge">{data.eventQr.available ? 'On' : 'Off'}</span
			></summary
		>
		<div class="qr-setting">
			<span>Add events via QR codes</span>
			<button
				class="qr-switch"
				role="switch"
				aria-checked={data.eventQr.enabled}
				aria-label="Add events via QR codes"
				disabled={eventBusy ||
					(!data.eventQr.enabled &&
						!data.eventQr.calendars.some((c) => c.id === data.eventQr.calendarId))}
				onclick={() => saveEventQr(!data.eventQr.enabled, data.eventQr.calendarId)}
				><span></span></button
			>
		</div>
		<label class="event-calendar-label" for="event-calendar">Default calendar</label>
		<select
			id="event-calendar"
			value={data.eventQr.calendarId}
			disabled={eventBusy}
			onchange={(event) => saveEventQr(data.eventQr.enabled, event.currentTarget.value)}
		>
			<option value="" disabled>Choose a calendar</option>
			{#each data.eventQr.calendars as calendar}<option value={calendar.id}>{calendar.name}</option
				>{/each}
		</select>
		{#if data.eventQr.enabled && !data.eventQr.available}<p class="error-message">
				Choose an available calendar.
			</p>{/if}
		{#if eventFailure}<p class="error-message" role="alert">{eventFailure}</p>{/if}
	</details>
</main>

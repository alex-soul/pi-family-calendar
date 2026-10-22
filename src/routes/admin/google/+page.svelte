<script lang="ts">
	import { untrack } from 'svelte';
	import CalendarAppearanceEditor from '#lib/components/CalendarAppearanceEditor.svelte';
	import { api } from '#lib/api.ts';
	import type { CalendarSnapshot } from '#lib/domain.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const googleGuide =
		'https://github.com/alex-soul/pi-family-calendar/blob/main/docs/google-calendar.md';
	const helperGuide =
		'https://github.com/alex-soul/pi-family-calendar/blob/main/docs/appliance-tools.md#windows-google-connection-helper';
	let setupOpen = $state(false);
	let google = $state(untrack(() => data.google));
	let clientId = $state(untrack(() => data.google.clientId));
	let clientSecret = $state('');
	let busy = $state(false),
		failure = $state(''),
		message = $state('');
	let selections = $state<Record<string, string[]>>(
		Object.fromEntries(
			untrack(() => data.google.accounts).map((a) => [
				a.id,
				a.calendars.filter((c) => c.selected).map((c) => c.googleId)
			])
		)
	);
	let disconnecting = $state<string | null>(null);
	let enabledCalendars = $derived([
		...new Map(
			google.accounts
				.flatMap((account) => account.calendars.filter((calendar) => calendar.selected))
				.map((calendar) => [calendar.id, calendar])
		).values()
	]);
	let lastSync = $state<CalendarSnapshot | null>(null);
	async function action(action: string, values: Record<string, unknown> = {}) {
		busy = true;
		failure = '';
		message = '';
		try {
			if (action === 'connect') {
				const result = await api<{ url: string }>('/api/google', {
					method: 'POST',
					body: JSON.stringify({ action })
				});
				window.location.assign(result.url);
				return;
			}
			if (action === 'sync') {
				const result = await api<{ snapshot: CalendarSnapshot; status: typeof google }>(
					'/api/google',
					{ method: 'POST', body: JSON.stringify({ action }) }
				);
				google = result.status;
				lastSync = result.snapshot;
				message =
					result.snapshot.sync?.message || `Synced ${result.snapshot.events.length} events.`;
			} else {
				google = await api<typeof google>('/api/google', {
					method: 'POST',
					body: JSON.stringify({ action, ...values })
				});
				message =
					action === 'configure'
						? 'Client credentials saved. You can now connect your Google account.'
						: action === 'disconnect'
							? 'Account removed from this installation.'
							: action === 'appearance'
								? 'Calendar appearance saved. Displays pick it up on their next refresh.'
								: 'Calendar selection saved.';
				if (action === 'configure') clientSecret = '';
			}
			selections = Object.fromEntries(
				google.accounts.map((a) => [
					a.id,
					a.calendars.filter((c) => c.selected).map((c) => c.googleId)
				])
			);
			disconnecting = null;
			return true;
		} catch (cause) {
			failure = (cause as Error).message;
			return false;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Google Calendar · Pi Family Calendar</title></svelte:head>
<main class="management google-management">
	<header class="manage-page-heading">
		<div>
			<h1>Google Calendar</h1>
		</div>
		<a class="secondary-link" href="https://calendar.google.com/" target="_blank" rel="noreferrer"
			>Open Google Calendar ↗</a
		>
	</header>
	{#if data.result === 'connected'}<p class="success-message" role="status">
			Google account connected. Review calendars below, then sync.
		</p>{/if}
	{#if data.result === 'cancelled'}<p class="muted">
			Sign-in was cancelled. No account was added.
		</p>{/if}
	{#if data.result === 'failed'}<p class="error-message" role="alert">
			Google connection was not completed. Start a new connection attempt or check the
			<a href={`${googleGuide}#troubleshooting`} target="_blank" rel="noreferrer"
				>troubleshooting guide ↗</a
			>.
		</p>{/if}
	{#if failure}<p role="alert" class="error-message">{failure}</p>{/if}
	{#if message}<p role="status" class={lastSync?.sync?.stale ? 'error-message' : 'success-message'}>
			{message}
		</p>{/if}
	<details class="management-card connection-help">
		<summary>Accounts &amp; calendars</summary>
		<p>Selected calendars are visible to everyone using this installation.</p>
		{#if !google.configured}<p>
				<a href="#google-setup" onclick={() => (setupOpen = true)}
					>Add your client credentials below</a
				>.
			</p>{/if}
		{#if !data.localConnection}<p class="management-hint">
				To connect an account from this laptop, use the
				<a href={helperGuide} target="_blank" rel="noreferrer">Windows connection helper ↗</a>.
			</p>{/if}
		<div class="form-actions">
			<button
				class="primary-button"
				disabled={busy || !google.configured || !data.localConnection}
				onclick={() => action('connect')}>Connect Google account</button
			><button disabled={busy || !google.accounts.length} onclick={() => action('sync')}
				>{busy ? 'Working…' : 'Sync now'}</button
			>
		</div>
		{#each google.accounts as account (account.id)}
			<article class="google-account">
				<h3>{account.label}</h3>
				{#if account.error}<p class="error-message">{account.error}</p>{/if}
				{#each account.calendars as calendar (calendar.googleId)}
					<label class="google-calendar-option"
						><input
							type="checkbox"
							value={calendar.googleId}
							bind:group={selections[account.id]}
							disabled={busy}
						/><span class="google-color" style:background={calendar.color}></span><span
							>{calendar.name}</span
						></label
					>
				{/each}
				<div class="form-actions">
					<button
						disabled={busy}
						onclick={() =>
							action('select', { accountId: account.id, calendarIds: selections[account.id] })}
						>Save calendar selection</button
					><button disabled={busy} onclick={() => (disconnecting = account.id)}>Disconnect</button>
				</div>
				{#if disconnecting === account.id}<p>
						Remove this account and its cached events from this installation? Google events will
						remain unchanged. To revoke Google's permission too, use
						<a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer"
							>your Google account ↗</a
						>.
					</p>
					<button disabled={busy} onclick={() => action('disconnect', { accountId: account.id })}
						>Remove connection</button
					><button onclick={() => (disconnecting = null)}>Keep it</button>{/if}
			</article>
		{/each}
		{#if lastSync?.fetchedAt}<p class="muted">
				Last successful sync for these dates: {new Date(lastSync.fetchedAt).toLocaleString()}
			</p>{/if}
		<p class="management-hint">
			See <a href="/admin/system">System</a> for sync status and frequency, or the
			<a href={`${googleGuide}#refresh-and-reliability`} target="_blank" rel="noreferrer"
				>sync guide ↗</a
			> for help.
		</p>
	</details>
	{#if enabledCalendars.length}
		<details class="management-card connection-help">
			<summary>Calendar appearance</summary>
			<p>
				Give each enabled calendar a friendly name and colour for all your screens. Google stays
				unchanged. Leave the name blank to use its Google name.
			</p>
			<div class="calendar-appearance-list">
				{#each enabledCalendars as calendar (calendar.id)}
					<CalendarAppearanceEditor
						{calendar}
						{busy}
						onsave={(name, color) => action('appearance', { calendarId: calendar.id, name, color })}
					/>
				{/each}
			</div>
		</details>
	{/if}
	<details id="google-setup" class="management-card google-setup-panel" bind:open={setupOpen}>
		<summary>Setup &amp; credentials</summary>
		<div class="setup-content">
			<p>
				<a href={googleGuide} target="_blank" rel="noreferrer"
					>Google Calendar setup guide on GitHub ↗</a
				>
			</p>
			<p class="management-hint">
				Google's Testing mode expires Calendar access after seven days. For regular use, follow the
				<a
					href={`${googleGuide}#tested-household-setup-using-the-project-pages`}
					target="_blank"
					rel="noreferrer">Production setup guide ↗</a
				>.
			</p>
			<h3>Authorised redirect URI</h3>
			<code class="google-redirect">{data.redirectUri}</code>
			<div class="laptop-connection">
				<h3>Windows laptop connection</h3>
				<p>
					<a href="/setup/connect-google.ps1" download="connect-google.ps1">Download helper</a>
					· <a href={helperGuide} target="_blank" rel="noreferrer">Instructions on GitHub ↗</a>
				</p>
				<code class="google-redirect"
					>powershell.exe -NoProfile -ExecutionPolicy Bypass -File
					"$HOME\Downloads\connect-google.ps1" -LocalPort {data.helperPort}</code
				>
			</div>
		</div>
		{#if google.accounts.length}<p class="muted">
				OAuth client saved. Disconnect accounts before replacing it.
			</p>
		{:else}<form
				onsubmit={(event) => {
					event.preventDefault();
					void action('configure', { clientId, clientSecret });
				}}
			>
				<label for="google-client-id">Client ID</label><input
					id="google-client-id"
					bind:value={clientId}
					autocomplete="off"
					required
					maxlength="500"
					placeholder="…apps.googleusercontent.com"
					disabled={busy}
				/>
				<label for="google-client-secret">Client secret</label><input
					id="google-client-secret"
					type="password"
					bind:value={clientSecret}
					autocomplete="new-password"
					required
					maxlength="1000"
					placeholder={google.configured ? 'Saved — enter only to replace' : 'Paste client secret'}
					disabled={busy}
				/>
				<p class="management-hint">
					Stored on this server. Saved secrets and tokens are never sent back to the browser.
				</p>
				<button class="primary-button" type="submit" disabled={busy}>Save OAuth client</button>
			</form>{/if}
	</details>
</main>

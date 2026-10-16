<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { CalendarSnapshot } from '#lib/domain.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
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
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Google Calendar · Pi Family Calendar</title></svelte:head>
<main class="management google-management">
	<header class="management-header">
		<a href="/">Calendar</a><a href="/manage">Manage reminders</a>
	</header>
	<div class="management-intro">
		<h1>Google Calendar</h1>
		<p>
			Connect accounts and choose the calendars this display reads. Changes in Google appear
			automatically; event editing stays in Google for now.
		</p>
	</div>
	{#if data.result === 'connected'}<p class="success-message" role="status">
			Google account connected. Review calendars below, then sync.
		</p>{/if}
	{#if data.result === 'cancelled'}<p class="muted">
			Sign-in was cancelled. No account was added.
		</p>{/if}
	{#if data.result === 'failed'}<p class="error-message" role="alert">
			Google connection was not completed. Check the client credentials, exact redirect URI,
			Calendar API and test users, then reconnect. Grant calendar read access. An expired or reused
			sign-in link must be restarted here.
		</p>{/if}
	{#if failure}<p role="alert" class="error-message">{failure}</p>{/if}
	{#if message}<p role="status" class={lastSync?.sync?.stale ? 'error-message' : 'success-message'}>
			{message}
		</p>{/if}
	<section class="management-card">
		<h2>1. OAuth client</h2>
		<details open={!google.configured}>
			<summary>First-time Google setup</summary>
			<ol class="google-setup">
				<li>
					Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer"
						>Google Cloud Console</a
					>. Check the project selector for an existing project, or create one for this calendar.
				</li>
				<li>In APIs &amp; Services → Library, enable <strong>Google Calendar API</strong>.</li>
				<li>
					Open Google Auth Platform. Set the app name/contact details under Branding. Choose
					External audience for personal Google accounts; while Testing, add each Google account you
					will connect as a test user.
				</li>
				<li>
					Under Clients, create an OAuth client of type <strong>Web application</strong>. Add this
					exact authorised redirect URI:<code class="google-redirect">{data.redirectUri}</code>
				</li>
				<li>
					Copy the client ID and secret into the fields below, save, then connect. You do not need
					an API key or a service account.
				</li>
			</ol>
			<p class="management-hint">
				Testing mode commonly requires reconnecting after seven days. Google may require
				verification for broader distribution; public release is a separate step. See <a
					href="https://developers.google.com/identity/protocols/oauth2#expiration"
					target="_blank"
					rel="noreferrer">Google's token-expiry guidance</a
				>.
			</p>
			<p class="management-hint">
				Use this computer's normal browser for Google sign-in. This preview is local-only; Pi/phone
				setup comes after secure device access is built.
			</p>
		</details>
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
	</section>
	<section class="management-card">
		<h2>2. Accounts and calendars</h2>
		<p>
			Connect one account that can read your shared calendars, or connect separate accounts. Shared
			calendars appear only once on the display. Everyone using this installation can see selected
			calendars.
		</p>
		<div class="form-actions">
			<button
				class="primary-button"
				disabled={busy || !google.configured}
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
						remain unchanged.
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
			The display checks every minute; Google data is refreshed at most every two minutes unless you
			choose Sync now. Cached events remain available during temporary failures, with a visible
			stale-data warning. Disconnect removes the local connection; revoke access in <a
				href="https://myaccount.google.com/connections"
				target="_blank"
				rel="noreferrer">your Google account</a
			> if needed.
		</p>
	</section>
</main>

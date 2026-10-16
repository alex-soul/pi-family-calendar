<script lang="ts">
	import { untrack } from 'svelte';
	import CalendarAppearanceEditor from '#lib/components/CalendarAppearanceEditor.svelte';
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
			<span class="eyebrow">CONNECTED CALENDARS</span>
			<h1>Google Calendar</h1>
			<p>Your events stay in Google. This calendar keeps them in view.</p>
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
			Google connection was not completed. Check the client credentials, exact redirect URI,
			Calendar API and test users, then reconnect. Grant calendar read access. An expired or reused
			sign-in link must be restarted here.
		</p>{/if}
	{#if failure}<p role="alert" class="error-message">{failure}</p>{/if}
	{#if message}<p role="status" class={lastSync?.sync?.stale ? 'error-message' : 'success-message'}>
			{message}
		</p>{/if}
	<section class="management-card">
		<div class="section-heading">
			<h2>Accounts &amp; calendars</h2>
			<span class="connection-badge">Read-only</span>
		</div>
		<p>
			Connect one account that can read your shared calendars, or connect separate accounts. Shared
			calendars appear only once on the display. Everyone using this installation can see selected
			calendars.
		</p>
		{#if !google.configured}<p>
				<a href="#google-setup">Start with setup &amp; credentials below</a>.
			</p>{/if}
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
	{#if enabledCalendars.length}
		<section class="management-card">
			<h2>Calendar appearance</h2>
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
		</section>
	{/if}
	<details class="management-card connection-help">
		<summary>Keep this connected 24/7</summary>
		<div class="setup-content">
			<h3>Testing lasts seven days</h3>
			<p>
				For an External app using Calendar access, Google issues refresh tokens that expire after
				seven days while its publishing status is Testing. Keeping the display running does not
				extend that deadline. This app cannot read your Cloud project's publishing status.
			</p>
			<h3>For a personal installation</h3>
			<p>
				In <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer"
					>Google Auth Platform → Audience</a
				>, move the OAuth app to In production when it is ready for regular use. Google provides a
				verification exception for personal use by you and a small number of people you know; an
				unverified-app warning and user cap can still apply. Follow the requirements shown for your
				project.
			</p>
			<p>
				Then use Connect Google account again for each connected account to obtain a fresh grant.
				There is no need to disconnect first; existing calendar choices are retained where still
				accessible.
			</p>
			<h3>Automatic renewal, with recovery</h3>
			<p>
				The server renews short-lived access tokens automatically and keeps the connection through
				restarts. A revoked grant, account policy or other token invalidation can still require
				reconnection. Temporary network failures show cached events with a warning.
			</p>
			<p>
				Publishing an OAuth app does not publish your calendars, expose the Pi, or make this
				repository public. Each self-hosting user supplies their own Google project and credentials;
				the product does not ship a shared OAuth client.
			</p>
			<p class="management-hint">
				Sources: <a
					href="https://developers.google.com/identity/protocols/oauth2#expiration"
					target="_blank"
					rel="noreferrer">Google token expiry</a
				>
				·
				<a
					href="https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions"
					target="_blank"
					rel="noreferrer">Personal-use verification exception</a
				>. This preview still needs secure phone-to-Pi access and a suitable sign-in callback before
				deployment.
			</p>
		</div>
	</details>
	<details id="google-setup" class="management-card google-setup-panel" open={!google.configured}>
		<summary>Setup &amp; credentials</summary>
		<div class="setup-content">
			<h3>First-time Google setup</h3>
			<ol class="google-setup">
				<li>
					Open <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer"
						>Google Cloud Console</a
					>. Check the project selector for an existing project, or create one for this calendar.
				</li>
				<li>In APIs &amp; Services → Library, enable <strong>Google Calendar API</strong>.</li>
				<li>
					Open <a
						href="https://console.cloud.google.com/auth/overview"
						target="_blank"
						rel="noreferrer">Google Auth Platform</a
					>. Set the app name/contact details under Branding. Choose External audience for personal
					Google accounts; while Testing, add each Google account you will connect as a test user.
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
				Use this computer's normal browser for Google sign-in. This preview is local-only; Pi/phone
				setup comes after secure device access is built.
			</p>
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

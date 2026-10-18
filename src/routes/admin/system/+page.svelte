<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ApplianceSystem from '#lib/components/ApplianceSystem.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let system = $state(untrack(() => data.system));
	let seconds = $state(untrack(() => data.system.calendar.intervalSeconds));
	let busy = $state(false),
		failure = $state(''),
		saved = $state('');
	const bytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;
	const time = (value: string | number) =>
		value ? new Date(value).toLocaleString('en-GB', { timeZone: system.timeZone }) : 'Not yet';
	let healthy = $derived(
		system.calendar.calendars.length > 0 &&
			system.calendar.calendars.every(
				(c) => c.lastSuccess && !c.error && Date.now() < c.nextAttempt + 120_000
			) &&
			!system.calendar.accountErrors.length
	);
	async function refresh() {
		try {
			system = await api<typeof system>('/api/admin/system');
			failure = '';
		} catch {
			failure = 'Status is unavailable. Retrying shortly.';
		}
	}
	async function action(action: string) {
		busy = true;
		saved = '';
		try {
			system = await api<typeof system>('/api/admin/system', {
				method: 'POST',
				body: JSON.stringify({ action, seconds })
			});
			failure = '';
			if (action === 'interval') saved = 'Sync interval saved.';
		} catch (e) {
			failure = (e as Error).message;
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

<svelte:head><title>System · Pi Family Calendar</title></svelte:head>
<main class="management admin-settings system-page">
	<header class="manage-page-heading">
		<h1>System</h1>
		<button class="icon-button" aria-label="Refresh status" onclick={refresh}
			><Icon name="sync" /></button
		>
	</header>
	{#if failure}<p role="alert" class="error-message">{failure}</p>{/if}
	<section class="management-card system-health" aria-label="Sync status">
		<div class="system-status-line">
			<span class:healthy class="system-status-dot"></span><strong
				>{system.calendar.running
					? system.calendar.activity
					: !system.calendar.configured
						? 'Google not connected'
						: !system.calendar.calendars.length && !system.calendar.accountErrors.length
							? 'No calendars enabled'
							: healthy
								? 'Up to date'
								: 'Needs attention'}</strong
			>
		</div>
		{#each system.calendar.accountErrors as message}<p class="error-message">{message}</p>{/each}
		<div class="system-metrics">
			<div>
				<strong>{system.calendar.eventCount.toLocaleString()}</strong><span>Stored events</span>
			</div>
			<div><strong>{system.calendar.calendars.length}</strong><span>Calendars</span></div>
			<div>
				<strong>{system.calendar.requestsToday.toLocaleString()}</strong><span
					>Google requests today · UTC</span
				>
			</div>
			<div><strong>{system.reminderCount}</strong><span>Reminders</span></div>
		</div>
		<button
			disabled={busy || system.calendar.running || !system.calendar.configured}
			onclick={() => action('sync')}><Icon name="sync" size={18} />Sync now</button
		>
	</section>
	<details class="management-card">
		<summary>Synchronization & coverage</summary>
		{#each system.calendar.calendars as calendar}<section class="system-calendar">
				<h2>{calendar.name}</h2>
				<dl class="admin-system">
					<div>
						<dt>Last successful sync</dt>
						<dd>{time(calendar.lastSuccess)}</dd>
					</div>
					<div>
						<dt>Next check</dt>
						<dd>{time(calendar.nextAttempt)}</dd>
					</div>
					<div>
						<dt>History</dt>
						<dd>
							{calendar.backfillComplete && calendar.lastSuccess
								? 'Imported'
								: 'Importing in background'}
						</dd>
					</div>
				</dl>
				{#if calendar.error}<p class="error-message">
						{calendar.error}
					</p>{/if}{#each calendar.ranges as range}<p class="system-coverage">
						{range.from} — {new Date(Date.parse(range.to + 'T12:00:00Z') - 86400000)
							.toISOString()
							.slice(0, 10)}
					</p>{/each}
			</section>{/each}
		<form
			class="system-interval"
			onsubmit={(e) => {
				e.preventDefault();
				void action('interval');
			}}
		>
			<label for="sync-interval">Sync interval · seconds</label>
			<div>
				<input
					id="sync-interval"
					type="number"
					min="60"
					max="3600"
					step="1"
					required
					bind:value={seconds}
				/><button disabled={busy}>Save</button>
			</div>
		</form>
		{#if saved}<p role="status">{saved}</p>{/if}
	</details>
	<ApplianceSystem appliance={system.appliance} pinEnabled={data.pinEnabled} />
	<details class="management-card">
		<summary>Storage & runtime</summary>
		<dl class="admin-system">
			<div>
				<dt>Database storage</dt>
				<dd>{bytes(system.databaseBytes)}</dd>
			</div>
			<div>
				<dt>App memory</dt>
				<dd>{bytes(system.appMemoryBytes)}</dd>
			</div>
			<div>
				<dt>App uptime</dt>
				<dd>
					{Math.floor(system.uptimeSeconds / 3600)}h {Math.floor(
						(system.uptimeSeconds % 3600) / 60
					)}m
				</dd>
			</div>
			<div>
				<dt>Version</dt>
				<dd>{system.version}</dd>
			</div>
			<div>
				<dt>Time zone</dt>
				<dd>{system.timeZone}</dd>
			</div>
		</dl>
	</details>
</main>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import type { GoogleCalendars } from '#lib/server/google.ts';
	type Status = ReturnType<GoogleCalendars['systemStatus']>;
	let { initial, timeZone }: { initial: Status; timeZone: string } = $props();
	let status = $state<Status>(untrack(() => initial));
	let busy = $state(false),
		polling = false;
	let failure = $state(''),
		statusFailure = $state(''),
		result = $state(''),
		resultFailed = $state(false);
	let revision = 0;
	const delayed = (calendar: Status['calendars'][number]) =>
		!!calendar.lastSuccess && Date.now() > calendar.nextAttempt + 120_000;
	const time = (value: string | number) =>
		value
			? new Date(value).toLocaleString('en-GB', {
					timeZone,
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				})
			: 'Not yet';
	async function refresh() {
		if (polling) return;
		polling = true;
		const readRevision = revision;
		try {
			const response = await api<{ sync: Status }>('/api/google');
			if (readRevision === revision) {
				status = response.sync;
				statusFailure = '';
			}
		} catch {
			statusFailure = 'Sync status is unavailable. Retrying shortly.';
		} finally {
			polling = false;
		}
	}
	async function sync(calendarId?: string) {
		busy = true;
		failure = '';
		result = '';
		try {
			const response = await api<{ sync: Status }>('/api/google', {
				method: 'POST',
				body: JSON.stringify({ action: 'sync', ...(calendarId ? { calendarId } : {}) })
			});
			status = response.sync;
			revision++;
			const calendars = status.calendars.filter((c) => !calendarId || c.id === calendarId);
			resultFailed =
				(!calendarId && !!status.accountErrors.length) ||
				!calendars.length ||
				calendars.some((c) => c.error || !c.lastSuccess);
			result = resultFailed
				? 'Sync finished with an issue. See the calendar status below.'
				: calendarId
					? `${calendars[0].name} synced successfully.`
					: 'Sync completed successfully.';
		} catch {
			failure =
				'The sync result could not be confirmed. Check the current status below before retrying.';
		} finally {
			busy = false;
			await refresh();
		}
	}
	onMount(() => {
		const timer = setInterval(() => {
			if (!document.hidden) void refresh();
		}, 2000);
		return () => clearInterval(timer);
	});
</script>

<section class="management-card google-sync" aria-label="Google synchronization">
	<div class="sync-heading">
		<div>
			<h2>Synchronization</h2>
			<p class="muted">
				{status.running || busy
					? status.activity || 'Synchronizing calendars…'
					: status.offline
						? 'Sync is disabled in this DEV instance'
						: !status.configured
							? 'Connect Google to start syncing'
							: 'Calendar status'}
			</p>
		</div>
		<button
			class="secondary-button"
			disabled={busy || status.running || status.offline || !status.calendars.length}
			onclick={() => sync()}>Sync now</button
		>
	</div>
	{#if failure}<p class="error-message" role="alert">{failure}</p>{/if}
	{#if statusFailure}<p class="error-message" role="alert">{statusFailure}</p>{/if}
	{#if result}<p
			class:error-message={resultFailed}
			class:success-message={!resultFailed}
			role="status"
		>
			{result}
		</p>{/if}
	{#each status.accountErrors as error}<p class="error-message">{error}</p>{/each}
	{#each status.calendars as calendar (calendar.id)}
		<article class="sync-calendar">
			<div class="sync-calendar-heading">
				<h3>{calendar.name}</h3>
				<span class:sync-warning={!!calendar.error || delayed(calendar)} class="sync-state"
					>{calendar.progress
						? 'Syncing'
						: calendar.error
							? 'Needs attention'
							: calendar.lastSuccess
								? delayed(calendar)
									? 'Check overdue'
									: 'Up to date'
								: 'Waiting for first sync'}</span
				>
			</div>
			{#if calendar.progress}
				<p role="status">
					{calendar.progress.phase}{calendar.progress.total
						? ` · ${calendar.progress.completed} of ${calendar.progress.total} batches`
						: '…'}
				</p>
				{#if calendar.progress.total}<progress
						max={calendar.progress.total}
						value={calendar.progress.completed}
						aria-label={calendar.progress.phase}
					></progress>{/if}
			{:else if calendar.error}<p class="error-message">{calendar.error}</p>{/if}
			{#if (calendar.error || calendar.progress || delayed(calendar)) && calendar.lastSuccess}<p
					class="muted"
				>
					Showing cached events from the last successful sync.
				</p>{/if}
			<div class="sync-calendar-footer">
				<dl>
					<div>
						<dt>Last success</dt>
						<dd>{time(calendar.lastSuccess)}</dd>
					</div>
					<div>
						<dt>{calendar.error ? 'Next retry' : 'Next check'}</dt>
						<dd>{time(calendar.nextAttempt)}</dd>
					</div>
				</dl>
				<button
					disabled={busy || status.running || status.offline}
					onclick={() => sync(calendar.id)}
					aria-label={`Retry ${calendar.name}`}>Retry this calendar</button
				>
			</div>
		</article>
	{/each}
</section>

<style>
	.sync-heading,
	.sync-calendar-heading,
	.sync-calendar-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.sync-heading h2 {
		font-size: 22px;
		margin-bottom: 6px;
	}
	.google-sync {
		display: grid;
		gap: 20px;
	}
	.sync-calendar {
		border-top: 1px solid var(--line);
		padding-top: 20px;
		display: grid;
		gap: 12px;
	}
	.sync-calendar h3 {
		margin: 0;
		font-size: 17px;
	}
	.sync-state {
		color: var(--accent);
		font-size: 13px;
	}
	.sync-warning {
		color: var(--danger);
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 28px;
		margin: 0;
		font-size: 13px;
	}
	dt {
		color: var(--muted);
		margin-bottom: 4px;
	}
	dd {
		margin: 0;
	}
	.sync-calendar-footer button {
		color: var(--accent);
		border: 1px solid var(--line);
	}
	progress {
		width: 100%;
		height: 6px;
		accent-color: var(--accent);
	}
</style>

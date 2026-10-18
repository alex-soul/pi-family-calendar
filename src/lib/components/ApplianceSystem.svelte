<script lang="ts">
	import { api } from '#lib/api.ts';
	import type { ApplianceStatus } from '#lib/server/appliance.ts';
	let { appliance, pinEnabled }: { appliance: ApplianceStatus; pinEnabled: boolean } = $props();
	let pending = $state<{
		action: 'reboot' | 'shutdown';
		confirmation: string;
		expiresAt: number;
	} | null>(null);
	let busy = $state(false),
		failure = $state(''),
		submitted = $state(false);
	const gib = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GiB`;
	const date = (value: number | null | undefined) =>
		value ? new Date(value).toLocaleString('en-GB') : 'Unknown';
	const age = (value: number | null | undefined, seconds: number) =>
		!value || Date.now() - value > seconds * 1000;
	async function prepare(action: 'reboot' | 'shutdown') {
		busy = true;
		failure = '';
		pending = null;
		try {
			const result = await api<{ confirmation: string; expiresAt: number }>(
				'/api/admin/appliance',
				{
					method: 'POST',
					body: JSON.stringify({ kind: 'power', operation: 'prepare', action })
				}
			);
			pending = { ...result, action };
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	async function confirm() {
		if (!pending) return;
		const selection = pending;
		pending = null;
		busy = true;
		failure = '';
		// Disable further submissions even when the response is lost during shutdown.
		submitted = true;
		try {
			await api('/api/admin/appliance', {
				method: 'POST',
				body: JSON.stringify({ kind: 'power', operation: 'confirm', ...selection })
			});
		} catch (cause) {
			failure = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<details class="management-card">
	<summary>Device health</summary>
	{#if appliance.host}
		{@const host = appliance.host}
		<dl class="admin-system">
			<div>
				<dt>Host uptime</dt>
				<dd>
					{host.uptimeSeconds === null
						? 'Unknown'
						: `${Math.floor(host.uptimeSeconds / 86400)}d ${Math.floor((host.uptimeSeconds % 86400) / 3600)}h`}
				</dd>
			</div>
			<div>
				<dt>Host memory</dt>
				<dd>
					{host.memory
						? `${gib(host.memory.total - host.memory.available)} / ${gib(host.memory.total)}`
						: 'Unknown'}
				</dd>
			</div>
			<div>
				<dt>Swap used</dt>
				<dd>{host.memory ? gib(host.memory.swapUsed) : 'Unknown'}</dd>
			</div>
			<div>
				<dt>Disk free</dt>
				<dd>{host.disk ? `${gib(host.disk.free)} / ${gib(host.disk.total)}` : 'Unknown'}</dd>
			</div>
			<div>
				<dt>Temperature</dt>
				<dd>{host.temperatureC === null ? 'Unknown' : `${host.temperatureC.toFixed(1)} °C`}</dd>
			</div>
			<div>
				<dt>Throttling flags</dt>
				<dd>
					{host.throttleFlags === null
						? 'Unknown'
						: host.throttleFlags === 0
							? 'None'
							: `0x${host.throttleFlags.toString(16)}`}
				</dd>
			</div>
			<div>
				<dt>Failed services</dt>
				<dd>{host.failedUnits ?? 'Unknown'}</dd>
			</div>
			<div>
				<dt>Display</dt>
				<dd>
					{!appliance.display
						? 'Unavailable'
						: !appliance.display.wakeMonitor
							? 'Wake monitor unavailable'
							: appliance.display.awake
								? 'On'
								: 'Sleeping'}
				</dd>
			</div>
			<div>
				<dt>MQTT</dt>
				<dd>
					{!host.mqtt || age(host.mqtt.sampledAt, 20)
						? 'Unavailable'
						: host.mqtt.connected
							? 'Connected'
							: 'Disconnected'}
				</dd>
			</div>
		</dl>
	{:else}<p>
			{appliance.state === 'not-configured'
				? 'Device controls are not configured.'
				: 'Device controller unavailable.'}
		</p>{/if}
</details>
<details class="management-card">
	<summary>Maintenance & backup</summary>
	<dl class="admin-system">
		<div>
			<dt>Maintenance status</dt>
			<dd>
				{!appliance.host?.maintenance || age(appliance.host.maintenance.sampledAt, 172800)
					? 'Unavailable or stale'
					: appliance.host.maintenance.status}
			</dd>
		</div>
		<div>
			<dt>Last successful update</dt>
			<dd>{date(appliance.host?.maintenance?.lastSuccess)}</dd>
		</div>
		<div>
			<dt>Next update</dt>
			<dd>{date(appliance.host?.maintenance?.nextUpdate)}</dd>
		</div>
		<div>
			<dt>Next reboot check</dt>
			<dd>{date(appliance.host?.maintenance?.nextReboot)}</dd>
		</div>
		<div>
			<dt>Reboot needed</dt>
			<dd>
				{appliance.host?.maintenance?.pendingReboot == null
					? 'Unknown'
					: appliance.host.maintenance.pendingReboot
						? 'Yes'
						: 'No'}
			</dd>
		</div>
		<div>
			<dt>Boot health</dt>
			<dd>{appliance.host?.maintenance?.bootHealth || 'Unknown'}</dd>
		</div>
		<div>
			<dt>Last successful backup</dt>
			<dd>{date(appliance.host?.backup?.lastSuccess)}</dd>
		</div>
		<div>
			<dt>Backup status</dt>
			<dd>
				{!appliance.host?.backup || age(appliance.host.backup.sampledAt, 172800)
					? 'Unavailable or stale'
					: appliance.host.backup.status}
			</dd>
		</div>
	</dl>
</details>
<details class="management-card">
	<summary>Device power</summary>
	{#if !pinEnabled}<p>Enable a PIN in Access to use power controls.</p>
	{:else if !appliance.powerEnabled}<p>Power controls are unavailable.</p>
	{:else if submitted}<p role="status">
			Power request submitted. Check the device before taking another action.
		</p>
	{:else if pending}
		<div class="power-confirm" role="group" aria-label="Confirm device power">
			<strong
				>{pending.action === 'reboot' ? 'Restart this device?' : 'Shut down this device?'}</strong
			>
			<p>
				{pending.action === 'reboot'
					? 'The calendar will be unavailable briefly.'
					: 'You will need to turn it on at the device.'}
			</p>
			<div class="power-actions">
				<button disabled={busy} onclick={() => (pending = null)}>Cancel</button><button
					class="danger"
					disabled={busy}
					onclick={confirm}
					>{pending.action === 'reboot' ? 'Restart device' : 'Shut down device'}</button
				>
			</div>
		</div>
	{:else}<div class="power-actions">
			<button disabled={busy} onclick={() => prepare('reboot')}>Restart</button><button
				disabled={busy}
				onclick={() => prepare('shutdown')}>Shut down</button
			>
		</div>{/if}
	{#if failure}<p role="alert" class="error-message">{failure}</p>{/if}
</details>

<style>
	.power-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}
	.power-actions button {
		flex: 1;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 10px;
	}
	.power-confirm {
		padding-top: 1rem;
	}
	dd {
		overflow-wrap: anywhere;
	}
</style>

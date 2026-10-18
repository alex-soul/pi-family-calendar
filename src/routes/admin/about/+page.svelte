<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>About · Pi Family Calendar</title></svelte:head>
<main class="management admin-settings about-page">
	<header class="manage-page-heading"><h1>About</h1></header>
	<section class="management-card" aria-label="Installed application">
		<div class="about-brand">
			<span class="admin-mark"><Icon name="calendar" size={28} /></span>
			<h2>Pi Family Calendar</h2>
		</div>
		<div class="about-version">
			<strong>{data.build.version}</strong><span>{data.build.channel}</span>
		</div>
		<dl class="admin-system">
			<div>
				<dt>Source revision</dt>
				<dd><code>{data.build.revision}</code></dd>
			</div>
			<div>
				<dt>Built</dt>
				<dd>
					{data.build.builtAt
						? new Date(data.build.builtAt).toLocaleString('en-GB', {
								timeZone: 'UTC',
								dateStyle: 'medium',
								timeStyle: 'short'
							}) + ' UTC'
						: 'Not recorded'}
				</dd>
			</div>
		</dl>
		<p class="about-credits">Created by Alex Soul.<br />Built with OpenAI Codex.</p>
	</section>
	<details class="management-card">
		<summary>Runtime details</summary>
		<dl class="admin-system">
			<div>
				<dt>Node.js</dt>
				<dd>{data.build.runtime}</dd>
			</div>
			<div>
				<dt>Platform</dt>
				<dd>{data.build.platform}</dd>
			</div>
		</dl>
	</details>
</main>

<style>
	.about-brand {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.about-brand h2 {
		margin: 0;
		font-size: 22px;
	}
	.about-version {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 24px;
	}
	.about-version strong {
		font-size: 28px;
		letter-spacing: -0.03em;
	}
	.about-version span {
		color: var(--accent);
		border: 1px solid var(--line);
		border-radius: 100px;
		padding: 5px 10px;
		font-size: 12px;
	}
	.about-credits {
		color: var(--muted);
		font-size: 13px;
		line-height: 1.8;
		margin-bottom: 0;
	}
	dd {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	code {
		font-size: 12px;
	}
	@media (max-width: 480px) {
		.admin-system > div {
			flex-direction: column;
			gap: 7px;
		}
		dd {
			text-align: left;
		}
	}
</style>

<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Admin · Pi Family Calendar</title></svelte:head>
<main class="admin-overview" aria-label="Admin overview">
	<div class="admin-cards">
		<a class="admin-card" href="/admin/reminders"
			><span class="admin-card-icon"><Icon name="list" size={27} /></span>
			<h2>Reminders</h2>
			<p>To-dos, notes and repeating routines.</p>
			<div class="admin-card-footer">
				<span>{data.reminderCount} saved · General</span><Icon name="right" size={20} />
			</div></a
		>
		<a class="admin-card" href="/admin/google"
			><span class="admin-card-icon"><Icon name="calendar" size={27} /></span>
			<h2>Google Calendar</h2>
			<p>Accounts, connected calendars and sync.</p>
			<div class="admin-card-footer">
				<span
					>{data.accountCount
						? `${data.calendarCount} calendar${data.calendarCount === 1 ? '' : 's'} · ${data.accountCount} account${data.accountCount === 1 ? '' : 's'}`
						: 'Set up your connection'}</span
				><Icon name="right" size={20} />
			</div></a
		>
		<a class="admin-card" href="/admin/settings"
			><span class="admin-card-icon"><Icon name="lock" size={27} /></span>
			<h2>Access & system</h2>
			<p>Optional PIN protection and installation details.</p>
			<div class="admin-card-footer">
				<span>{data.pinEnabled ? 'PIN protection on' : 'PIN protection off'}</span><Icon
					name="right"
					size={20}
				/>
			</div></a
		>
	</div>
</main>

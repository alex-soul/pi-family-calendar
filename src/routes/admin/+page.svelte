<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Admin · Pi Family Calendar</title></svelte:head>
<main class="admin-overview">
	<header class="manage-page-heading">
		<div>
			<span class="eyebrow">YOUR INSTALLATION</span>
			<h1>A place for everything.</h1>
			<p>Manage the essentials here. Keep your calendar screen calm.</p>
		</div>
	</header>
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
	<section class="admin-explainer">
		<Icon name="layers" size={24} />
		<div>
			<h2>One installation. Your choice of screens.</h2>
			<p>
				Connect calendars here, then use the calendar button in each display’s header to choose what
				it shows. Theme and idle settings belong to that browser.
			</p>
		</div>
	</section>
</main>

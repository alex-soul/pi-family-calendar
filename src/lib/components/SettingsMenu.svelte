<script lang="ts">
	import type { CalendarSnapshot } from '#lib/domain.ts';
	import { seconds } from '#lib/inactivity.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	let {
		snapshot,
		theme = $bindable(),
		hiddenCalendars = $bindable(),
		resetScrollSeconds = $bindable(),
		returnTodaySeconds = $bindable(),
		onclose
	}: {
		snapshot: CalendarSnapshot;
		theme: 'warm' | 'dark';
		hiddenCalendars: string[];
		resetScrollSeconds: number | undefined;
		returnTodaySeconds: number | undefined;
		onclose: () => void;
	} = $props();
	let section = $state<'home' | 'display' | 'calendars'>('home');
	const titles = {
		home: 'Menu',
		display: 'Display & behaviour',
		calendars: 'Calendars on this screen'
	};
</script>

<Modal title={titles[section]} {onclose}>
	{#if section !== 'home'}<button class="menu-back" onclick={() => (section = 'home')}
			><Icon name="left" size={18} />Menu</button
		>{/if}
	{#if section === 'home'}
		<nav class="menu-links" aria-label="Calendar settings">
			<a class="menu-row" href="/manage"
				><span class="menu-symbol"><Icon name="list" /></span><span
					><strong>Reminders &amp; events</strong><small>Manage reminders and Google Calendar</small
					></span
				><Icon name="right" size={18} /></a
			>
			<button class="menu-row" onclick={() => (section = 'display')}
				><span class="menu-symbol"><Icon name="settings" /></span><span
					><strong>Display & behaviour</strong><small>Theme and idle timers</small></span
				><Icon name="right" size={18} /></button
			>
			<button class="menu-row" onclick={() => (section = 'calendars')}
				><span class="menu-symbol"><Icon name="calendar" /></span><span
					><strong>Visible calendars</strong><small>Choose what appears on this screen</small></span
				><Icon name="right" size={18} /></button
			>
		</nav>
		<div class="menu-status">
			<span class="status-dot" class:warning={snapshot.source !== 'google' || snapshot.sync?.stale}
			></span>
			<div>
				<strong
					>{snapshot.source === 'google'
						? snapshot.sync?.stale
							? 'Calendar needs attention'
							: 'Google Calendar · read-only'
						: snapshot.source === 'demo'
							? 'Sample calendar'
							: 'Google not connected'}</strong
				>{#if snapshot.source === 'google' && snapshot.fetchedAt}<small
						>Last synced {new Date(snapshot.fetchedAt).toLocaleString('en-GB', {
							timeZone: snapshot.timeZone,
							day: 'numeric',
							month: 'short',
							hour: '2-digit',
							minute: '2-digit'
						})}</small
					>{/if}
			</div>
		</div>
	{:else if section === 'display'}
		<p class="menu-context">
			These preferences belong to this browser. Changing them on your phone will not change the Pi
			display.
		</p>
		<section class="settings-section">
			<h3>Appearance</h3>
			<div class="theme-options">
				<button
					class:chosen={theme === 'warm'}
					onclick={() => (theme = 'warm')}
					aria-pressed={theme === 'warm'}><span class="theme-swatch warm"></span>Warm</button
				>
				<button
					class:chosen={theme === 'dark'}
					onclick={() => (theme = 'dark')}
					aria-pressed={theme === 'dark'}><span class="theme-swatch dark"></span>Dark</button
				>
			</div>
		</section>
		<section class="settings-section">
			<h3>When left idle</h3>
			<div class="inactivity-options">
				<label for="reset-scroll">Reset scroll</label><input
					id="reset-scroll"
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					bind:value={resetScrollSeconds}
					onchange={() => (resetScrollSeconds = seconds(resetScrollSeconds))}
					aria-describedby="idle-help"
				/><span>sec</span>
				<label for="return-today">Return to Today</label><input
					id="return-today"
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					bind:value={returnTodaySeconds}
					onchange={() => (returnTodaySeconds = seconds(returnTodaySeconds))}
					aria-describedby="idle-help"
				/><span>sec</span>
			</div>
			<p id="idle-help" class="management-hint">
				Leave a field blank to disable it. The menu button and expanded all-day rows reset after 15
				seconds.
			</p>
		</section>
		<p class="menu-footnote">Saved automatically · Time zone: {snapshot.timeZone}</p>
	{:else}
		<p class="menu-context">
			Hide a calendar here without disconnecting it. Other screens keep their own selection.
		</p>
		<div class="calendar-options">
			{#each snapshot.calendars as calendar}<button
					class="calendar-option"
					aria-pressed={!hiddenCalendars.includes(calendar.id)}
					onclick={() =>
						(hiddenCalendars = hiddenCalendars.includes(calendar.id)
							? hiddenCalendars.filter((id) => id !== calendar.id)
							: [...hiddenCalendars, calendar.id])}
					><span class="calendar-label" style:--calendar-color={calendar.color}
						>{calendar.name}</span
					><span class="checkbox"
						>{#if !hiddenCalendars.includes(calendar.id)}<Icon name="check" size={18} />{/if}</span
					></button
				>{:else}<p class="muted">Connect Google Calendar to choose calendars.</p>{/each}
		</div>
		<a class="settings-footer-link" href="/manage/google"
			>Manage connected calendars<Icon name="right" size={18} /></a
		>
	{/if}
</Modal>

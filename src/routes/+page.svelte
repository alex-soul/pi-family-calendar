<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import {
		addDays,
		dateKey,
		dateLabel,
		indexEvents,
		monthGrid,
		startOfWeek,
		timeLabel
	} from '#lib/dates.ts';
	import type { CalendarEvent, CalendarSnapshot, Reminder } from '#lib/domain.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import DayAgenda from '#lib/components/DayAgenda.svelte';
	import EventCard from '#lib/components/EventCard.svelte';
	import ReminderList from '#lib/components/ReminderList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let snapshot = $state<CalendarSnapshot>(untrack(() => data.snapshot));
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let now = $state(untrack(() => new Date(data.now)));
	let clockNow = $state(untrack(() => new Date(data.now)));
	let selectedDate = $state(untrack(() => data.today));
	let today = $derived(dateKey(clockNow, snapshot.timeZone));
	let view = $state<'day' | '2' | '3' | 'week'>('day');
	let theme = $state<'warm' | 'slate'>('warm');
	let hiddenCalendars = $state<string[]>([]);
	let modal = $state<'settings' | 'month' | 'reminders' | null>(null);
	let detail = $state<CalendarEvent | null>(null);
	let monthDate = $state(untrack(() => data.today));
	let busy = $state<string | null>(null);
	let calendarFailure = $state('');
	let reminderFailure = $state('');
	let reminderWriteFailure = $state('');
	let failure = $derived(
		[calendarFailure, reminderFailure, reminderWriteFailure].filter(Boolean).join(' ')
	);
	let ready = $state(false);
	let calendarLoading = $state(false);
	let showSettings = $state(true);
	let lastInteraction = Date.now();
	let calendarRequest = 0;
	let reminderRequest = 0;
	let settingsTimer: ReturnType<typeof setTimeout>;

	let visibleEvents = $derived(
		snapshot.events.filter((event) => !hiddenCalendars.includes(event.calendarId))
	);
	let eventIndex = $derived(
		indexEvents(visibleEvents, snapshot.from, snapshot.to, snapshot.timeZone)
	);
	let dayDates = $derived(
		Array.from({ length: view === 'week' ? 7 : view === 'day' ? 1 : Number(view) }, (_, i) =>
			addDays(view === 'week' ? startOfWeek(selectedDate) : selectedDate, i)
		)
	);
	let outstanding = $derived(reminders.filter((r) => !r.completedAt));
	let due = $derived(outstanding.filter((r) => !r.dueDate || r.dueDate <= selectedDate));
	let grid = $derived(monthGrid(monthDate));

	function interact() {
		lastInteraction = Date.now();
		showSettings = true;
		clearTimeout(settingsTimer);
		settingsTimer = setTimeout(() => {
			showSettings = false;
		}, 8_000);
	}
	async function loadCalendar(date: string) {
		const request = ++calendarRequest;
		calendarLoading = true;
		try {
			const next = await api<CalendarSnapshot>(`/api/calendar?date=${date}`);
			if (request === calendarRequest) {
				snapshot = next;
				calendarFailure = '';
			}
		} catch (cause) {
			if (request === calendarRequest)
				calendarFailure = `${(cause as Error).message} Calendar data may be incomplete for these dates.`;
		} finally {
			if (request === calendarRequest) calendarLoading = false;
		}
	}
	function navigate(date: string) {
		selectedDate = date;
		if (calendarLoading || date < snapshot.from || addDays(date, 7) >= snapshot.to)
			void loadCalendar(date);
	}
	function openMonth() {
		monthDate = selectedDate;
		modal = 'month';
		void loadCalendar(monthDate);
	}
	function moveMonth(amount: number) {
		const next = new Date(`${monthDate.slice(0, 7)}-01T12:00:00Z`);
		next.setUTCMonth(next.getUTCMonth() + amount);
		monthDate = next.toISOString().slice(0, 10);
		void loadCalendar(monthDate);
	}
	function closeMonth() {
		modal = null;
		void loadCalendar(selectedDate);
	}
	function toggleCalendar(id: string) {
		hiddenCalendars = hiddenCalendars.includes(id)
			? hiddenCalendars.filter((v) => v !== id)
			: [...hiddenCalendars, id];
	}
	async function refreshReminders() {
		const request = ++reminderRequest;
		try {
			const next = await api<Reminder[]>('/api/reminders');
			if (request === reminderRequest) {
				reminders = next;
				reminderFailure = '';
			}
		} catch {
			if (request === reminderRequest)
				reminderFailure = 'Connection lost. Reminders may be out of date.';
		}
	}
	async function toggleReminder(reminder: Reminder) {
		if (busy) return;
		busy = reminder.id;
		reminderWriteFailure = '';
		++reminderRequest;
		try {
			const updated = await api<Reminder>(`/api/reminders/${reminder.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ version: reminder.version, completed: !reminder.completedAt })
			});
			reminders = reminders.map((r) => (r.id === updated.id ? updated : r));
		} catch (cause) {
			reminderWriteFailure = (cause as Error).message;
			await refreshReminders();
		} finally {
			busy = null;
		}
	}
	onMount(() => {
		try {
			const preferences = JSON.parse(localStorage.getItem('calendar-display-v1') || '{}');
			if (['warm', 'slate'].includes(preferences.theme)) theme = preferences.theme;
			if (['day', '2', '3', 'week'].includes(preferences.view)) view = preferences.view;
			if (Array.isArray(preferences.hiddenCalendars))
				hiddenCalendars = preferences.hiddenCalendars.filter((v: unknown) => typeof v === 'string');
		} catch {
			/* A blocked storage API must not prevent viewing the calendar. */
		}
		ready = true;
		interact();
		const timer = setInterval(() => {
			const next = new Date();
			clockNow = next;
			if (!document.hidden && !busy) void refreshReminders();
			if (!modal && !detail && Date.now() - lastInteraction > 10_000) {
				if (
					selectedDate === dateKey(now, snapshot.timeZone) &&
					dateKey(next, snapshot.timeZone) !== dateKey(now, snapshot.timeZone)
				)
					navigate(dateKey(next, snapshot.timeZone));
				now = next;
			}
		}, 30_000);
		return () => {
			clearInterval(timer);
			clearTimeout(settingsTimer);
		};
	});
	$effect(() => {
		if (ready) {
			document.documentElement.dataset.theme = theme;
			try {
				localStorage.setItem(
					'calendar-display-v1',
					JSON.stringify({ theme, view, hiddenCalendars })
				);
			} catch {
				/* Optional preferences. */
			}
		}
	});
</script>

<svelte:head
	><title>Pi Family Calendar</title><meta
		name="description"
		content="A small, glanceable family calendar."
	/></svelte:head
>
<svelte:window onpointerdown={interact} onkeydown={interact} />

<main class="appliance">
	<header class="app-header">
		<div>
			<div class="eyebrow">
				Family calendar <span class="source-badge"
					>{snapshot.source === 'demo' ? 'Sample events' : 'Google not connected'}</span
				>
			</div>
			<h1>{dateLabel(selectedDate, { month: 'long', year: 'numeric' })}</h1>
		</div>
		<div class="header-right">
			<button
				class="icon-count"
				aria-label={`Open all reminders, ${outstanding.length} incomplete`}
				onclick={() => (modal = 'reminders')}
				><Icon name="list" /><span>{outstanding.length}</span></button
			>
			<div class="clock">
				{timeLabel(clockNow.toISOString(), snapshot.timeZone)}<small
					>{dateLabel(today, { weekday: 'short', day: 'numeric', month: 'short' })}</small
				>
			</div>
		</div>
	</header>
	<nav class="toolbar" aria-label="Calendar views">
		<div class="view-tabs">
			{#each [['day', 'Day'], ['2', '2 days'], ['3', '3 days'], ['week', 'Week']] as [id, label]}<button
					class:active={view === id}
					aria-pressed={view === id}
					onclick={() => (view = id as typeof view)}>{label}</button
				>{/each}<button onclick={openMonth}
				><Icon name="calendar" size={19} /><span>Month</span></button
			>
		</div>
		<div class="date-nav">
			<button
				class="icon-button"
				aria-label="Previous dates"
				onclick={() => navigate(addDays(selectedDate, view === 'week' ? -7 : -1))}
				><Icon name="left" /></button
			><button onclick={() => navigate(today)}>Today</button><button
				class="icon-button"
				aria-label="Next dates"
				onclick={() => navigate(addDays(selectedDate, view === 'week' ? 7 : 1))}
				><Icon name="right" /></button
			>
		</div>
	</nav>
	{#if failure}<div class="status-banner" role="alert">
			{failure}<button
				onclick={() => {
					reminderWriteFailure = '';
					void loadCalendar(selectedDate);
					void refreshReminders();
				}}>Retry</button
			>
		</div>{/if}
	{#if calendarLoading}<div class="loading-line" role="status">Loading dates…</div>{/if}
	{#if snapshot.source === 'unconnected'}<div class="status-banner">
			No calendar source connected. Reminders are available locally.
		</div>{/if}

	{#if view === 'week'}
		<div class="week-grid">
			{#each dayDates as date}
				<section class="week-day" class:today={date === today}>
					<button
						class="week-heading"
						onclick={() => {
							navigate(date);
							view = 'day';
						}}
						><span>{dateLabel(date, { weekday: 'short' })}</span><strong
							>{dateLabel(date, { day: 'numeric' })}</strong
						></button
					>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions must support keyboard scrolling.) -->
					<div
						class="week-events scroll-area"
						role="region"
						tabindex="0"
						aria-label={`${date} events`}
					>
						{#each eventIndex.get(date) || [] as event (event.id)}<EventCard
								{event}
								calendar={snapshot.calendars.find((c) => c.id === event.calendarId)}
								timeZone={snapshot.timeZone}
								{now}
								compact
								onopen={(e) => (detail = e)}
							/>{:else}<span class="week-empty">—</span>{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div
			class="main-grid"
			class:day-layout={view === 'day'}
			style:--columns={view === 'day' ? 1 : Number(view)}
		>
			{#each dayDates as date (date)}<DayAgenda
					{date}
					{today}
					events={eventIndex.get(date) || []}
					calendars={snapshot.calendars}
					timeZone={snapshot.timeZone}
					{now}
					dense={view === '3'}
					onopen={(e) => (detail = e)}
				/>{/each}
			{#if view === 'day'}
				<aside class="todo-panel">
					<header class="day-heading">
						<div>
							<span class="eyebrow">Little things</span>
							<h2>To do</h2>
						</div>
						<button
							class="icon-count"
							aria-label="Open all reminders"
							onclick={() => (modal = 'reminders')}
							><Icon name="list" size={20} /><span>{outstanding.length}</span></button
						>
					</header>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions must support keyboard scrolling.) -->
					<div class="todo-scroll scroll-area" role="region" tabindex="0" aria-label="Reminders">
						<ReminderList
							reminders={due}
							{today}
							{busy}
							ontoggle={toggleReminder}
						/>{#if !due.length}<div class="empty-state">
								<Icon name="check" size={32} />
								<p>{outstanding.length ? 'Nothing due yet' : 'All clear for now'}</p>
								<small
									>{outstanding.length
										? 'Future items are in the full list.'
										: 'Add something from the management page.'}</small
								>
							</div>{/if}
					</div>
					<p class="panel-note">
						{selectedDate === today
							? 'Today & unfinished'
							: `Due by ${dateLabel(selectedDate, { day: 'numeric', month: 'short' })}`} · Tap to complete
					</p>
				</aside>
			{/if}
		</div>
	{/if}
	<button
		class="settings-reveal icon-button"
		class:revealed={showSettings}
		aria-label="Display settings"
		onclick={() => (modal = 'settings')}><Icon name="settings" /></button
	>
</main>

{#if detail}
	<Modal title="Event" onclose={() => (detail = null)}>
		{@const calendar = snapshot.calendars.find((c) => c.id === detail?.calendarId)}
		<span class="calendar-label" style:--calendar-color={calendar?.color}>{calendar?.name}</span>
		<h2 class="detail-title">{detail.title}</h2>
		<p class="detail-time">
			{#if detail.kind === 'all-day'}{dateLabel(detail.startDate, {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				})} · All day{#if addDays(detail.startDate, 1) !== detail.endDate}<br />Through {dateLabel(
						addDays(detail.endDate, -1),
						{ day: 'numeric', month: 'long' }
					)}{/if}{:else}{dateLabel(dateKey(detail.start, snapshot.timeZone), {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				})}<br />{timeLabel(detail.start, snapshot.timeZone)} – {timeLabel(
					detail.end,
					snapshot.timeZone
				)}{#if dateKey(detail.start, snapshot.timeZone) !== dateKey(detail.end, snapshot.timeZone)}
					· {dateLabel(dateKey(detail.end, snapshot.timeZone), {
						day: 'numeric',
						month: 'short'
					})}{/if}{/if}
		</p>
		{#if detail.location}<p class="location">
				<Icon name="location" />{detail.location}
			</p>{/if}{#if detail.description}<p class="detail-description">{detail.description}</p>{/if}
	</Modal>
{/if}
{#if modal === 'settings'}
	<Modal title="Display settings" onclose={() => (modal = null)}>
		<h3>Appearance</h3>
		<div class="theme-options">
			<button
				class:chosen={theme === 'warm'}
				onclick={() => (theme = 'warm')}
				aria-pressed={theme === 'warm'}><span class="theme-swatch warm"></span>Warm</button
			><button
				class:chosen={theme === 'slate'}
				onclick={() => (theme = 'slate')}
				aria-pressed={theme === 'slate'}><span class="theme-swatch slate"></span>Slate</button
			>
		</div>
		<h3>Calendars on this screen</h3>
		<div class="calendar-options">
			{#each snapshot.calendars as calendar}<button
					class="calendar-option"
					aria-pressed={!hiddenCalendars.includes(calendar.id)}
					onclick={() => toggleCalendar(calendar.id)}
					><span class="calendar-label" style:--calendar-color={calendar.color}
						>{calendar.name}</span
					><span class="checkbox"
						>{#if !hiddenCalendars.includes(calendar.id)}<Icon name="check" size={18} />{/if}</span
					></button
				>{/each}
		</div>
		<p class="muted">Saved for this browser. Time zone: {snapshot.timeZone}.</p>
		<p class="management-hint">
			Use <strong>/manage</strong> on your computer for reminder forms. Phone and LAN access follow after
			device pairing is built.
		</p>
	</Modal>
{:else if modal === 'reminders'}
	<Modal title="To do" onclose={() => (modal = null)}>
		<ReminderList
			reminders={outstanding}
			{today}
			{busy}
			ontoggle={toggleReminder}
		/>{#if !outstanding.length}<p class="empty-state">Nothing outstanding.</p>{/if}
		{#if reminders.some((r) => r.completedAt)}<h3>Completed · tap to undo</h3>
			<ReminderList
				reminders={reminders.filter((r) => r.completedAt)}
				{today}
				{busy}
				ontoggle={toggleReminder}
			/>{/if}
	</Modal>
{:else if modal === 'month'}
	<Modal title="Choose a day" onclose={closeMonth} wide>
		<div class="month-nav">
			<button class="icon-button" aria-label="Previous month" onclick={() => moveMonth(-1)}
				><Icon name="left" /></button
			>
			<h3>{dateLabel(monthDate, { month: 'long', year: 'numeric' })}</h3>
			<button class="icon-button" aria-label="Next month" onclick={() => moveMonth(1)}
				><Icon name="right" /></button
			>
		</div>
		{#if calendarLoading}<p role="status" class="muted">Loading…</p>{/if}
		<div class="month-grid">
			{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as weekday}<span class="weekday">{weekday}</span
				>{/each}{#each grid as date}<button
					class:outside={date.slice(0, 7) !== monthDate.slice(0, 7)}
					class:today={date === today}
					class:selected={date === selectedDate}
					aria-label={dateLabel(date, {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
						year: 'numeric'
					})}
					onclick={() => {
						navigate(date);
						view = 'day';
						modal = null;
					}}
					><span>{Number(date.slice(8))}</span><span class="month-dots"
						>{#each snapshot.calendars.filter((c) => !hiddenCalendars.includes(c.id) && (eventIndex.get(date) || []).some((e) => e.calendarId === c.id)) as calendar}<i
								style:background={calendar.color}
							></i>{/each}</span
					></button
				>{/each}
		</div>
		<p class="muted">Tap a date to open its agenda.</p>
	</Modal>
{/if}

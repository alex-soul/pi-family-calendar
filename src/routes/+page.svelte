<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '#lib/api.ts';
	import { addDays, dateKey, dateLabel, indexEvents, monthGrid, timeLabel } from '#lib/dates.ts';
	import type { CalendarEvent, CalendarSnapshot, Reminder } from '#lib/domain.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import DayAgenda from '#lib/components/DayAgenda.svelte';
	import AllDayStrip from '#lib/components/AllDayStrip.svelte';
	import EventCard from '#lib/components/EventCard.svelte';
	import ReminderList from '#lib/components/ReminderList.svelte';
	import ReminderDock from '#lib/components/ReminderDock.svelte';
	import ScheduleView from '#lib/components/ScheduleView.svelte';
	import { remindersForDay } from '#lib/display.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let snapshot = $state<CalendarSnapshot>(untrack(() => data.snapshot));
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let now = $state(untrack(() => new Date(data.now)));
	let clockNow = $state(untrack(() => new Date(data.now)));
	let selectedDate = $state(untrack(() => data.today));
	let today = $derived(dateKey(clockNow, snapshot.timeZone));
	let view = $state<'day' | '2' | '3' | 'week' | 'month' | 'schedule'>('day');
	let theme = $state<'warm' | 'dark'>('warm');
	let hiddenCalendars = $state<string[]>([]);
	let modal = $state<'settings' | 'reminders' | null>(null);
	let detail = $state<CalendarEvent | null>(null);
	let reminderDetail = $state<Reminder | null>(null);
	let actionNotice = $state<string | null>(null);
	let clockFormat = $derived(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: snapshot.timeZone,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		})
	);
	let expandedMonthDate = $state<string | null>(null);
	let collapseToken = $state(0);
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
	let pointerHeld = false;
	let followToken = $state(0);
	let idlePending = true;
	let dockOpen = $state(false);
	let idleSeconds = $state(15);
	let calendarRequest = 0;
	let reminderRequest = 0;

	let visibleEvents = $derived(
		snapshot.events.filter((event) => !hiddenCalendars.includes(event.calendarId))
	);
	let eventIndex = $derived(
		indexEvents(visibleEvents, snapshot.from, snapshot.to, snapshot.timeZone)
	);
	let dayDates = $derived(
		Array.from(
			{ length: view === 'week' ? 7 : view === '2' || view === '3' ? Number(view) : 1 },
			(_, i) => addDays(selectedDate, i)
		)
	);
	let outstanding = $derived(reminders.filter((r) => !r.completedAt));
	let dockDate = $derived(['day', '2', '3'].includes(view) ? selectedDate : today);
	let dayReminders = $derived(remindersForDay(reminders, dockDate));
	let due = $derived(dayReminders.items.filter((r) => !r.completedAt));
	let grid = $derived.by(() => {
		const dates = monthGrid(monthDate);
		while (dates.length > 28 && dates[dates.length - 7].slice(0, 7) !== monthDate.slice(0, 7))
			dates.splice(-7);
		return dates;
	});

	function interact() {
		lastInteraction = Date.now();
		idlePending = true;
		showSettings = true;
	}
	async function loadCalendar(date: string) {
		const request = ++calendarRequest;
		calendarLoading = true;
		try {
			const next = await api<CalendarSnapshot>(`/api/calendar?date=${date}`);
			if (request === calendarRequest) {
				snapshot = next;
				followToken++;
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
		followToken++;
		selectedDate = date;
		if (calendarLoading || date < snapshot.from || addDays(date, 7) >= snapshot.to)
			void loadCalendar(date);
	}
	function openMonth() {
		expandedMonthDate = null;
		monthDate = selectedDate;
		view = 'month';
		void loadCalendar(monthDate);
	}
	function moveMonth(amount: number) {
		expandedMonthDate = null;
		const next = new Date(`${monthDate.slice(0, 7)}-01T12:00:00Z`);
		next.setUTCMonth(next.getUTCMonth() + amount);
		monthDate = next.toISOString().slice(0, 10);
		void loadCalendar(monthDate);
	}
	function chooseView(next: typeof view) {
		if (next === 'month') {
			openMonth();
			return;
		}
		view = next;
		if (next === 'schedule' || next === 'week') {
			selectedDate = today;
			void loadCalendar(today);
		} else navigate(selectedDate);
		followToken++;
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
			if (preferences.theme === 'slate') theme = 'dark';
			else if (['warm', 'dark'].includes(preferences.theme)) theme = preferences.theme;
			if ([0, 15, 30, 60].includes(preferences.idleSeconds)) idleSeconds = preferences.idleSeconds;
			if (['day', '2', '3', 'week', 'month', 'schedule'].includes(preferences.view))
				view = preferences.view;
			if (Array.isArray(preferences.hiddenCalendars))
				hiddenCalendars = preferences.hiddenCalendars.filter((v: unknown) => typeof v === 'string');
		} catch {
			/* A blocked storage API must not prevent viewing the calendar. */
		}
		ready = true;
		interact();
		const clockTimer = setInterval(() => {
			clockNow = new Date();
			if (idleSeconds && !pointerHeld && Date.now() - lastInteraction >= idleSeconds * 1000)
				showSettings = false;
			if (
				!document.hidden &&
				!pointerHeld &&
				!modal &&
				!dockOpen &&
				!detail &&
				!reminderDetail &&
				!actionNotice &&
				idleSeconds &&
				idlePending &&
				Date.now() - lastInteraction >= idleSeconds * 1000
			) {
				now = clockNow;
				followToken++;
				idlePending = false;
				collapseToken++;
			}
		}, 1_000);
		const timer = setInterval(() => {
			const next = new Date();
			clockNow = next;
			if (!document.hidden && !busy) void refreshReminders();
			if (
				!modal &&
				!dockOpen &&
				!detail &&
				!reminderDetail &&
				!actionNotice &&
				Date.now() - lastInteraction >= (idleSeconds || 15) * 1000
			) {
				if (
					selectedDate === dateKey(now, snapshot.timeZone) &&
					dateKey(next, snapshot.timeZone) !== dateKey(now, snapshot.timeZone)
				)
					navigate(dateKey(next, snapshot.timeZone));
				now = next;
				if (idleSeconds && !document.hidden && !pointerHeld) followToken++;
			}
		}, 30_000);
		return () => {
			clearInterval(timer);
			clearInterval(clockTimer);
		};
	});
	$effect(() => {
		if (ready) {
			document.documentElement.dataset.theme = theme;
			try {
				localStorage.setItem(
					'calendar-display-v1',
					JSON.stringify({ theme, view, hiddenCalendars, idleSeconds })
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
<svelte:window
	onpointerdown={() => {
		pointerHeld = true;
		interact();
	}}
	onpointerup={() => {
		pointerHeld = false;
		interact();
	}}
	onpointercancel={() => {
		pointerHeld = false;
		interact();
	}}
	onpointermove={(e) => {
		if (e.buttons) interact();
	}}
	onkeydown={interact}
	onwheel={interact}
	ontouchmove={interact}
/>

{#snippet dateControls()}
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
		<button class="icon-button" aria-label="Add event" onclick={() => (actionNotice = 'Add event')}
			><Icon name="plus" /></button
		>
	</div>
{/snippet}

<main class="appliance">
	<header class="app-header">
		<nav aria-label="Calendar views">
			<div class="view-tabs">
				{#each [['day', 'Day'], ['2', '2 days'], ['3', '3 days'], ['week', '7 days'], ['month', 'Month'], ['schedule', 'Schedule']] as [id, label]}<button
						class:active={view === id}
						aria-pressed={view === id}
						onclick={() => chooseView(id as typeof view)}>{label}</button
					>{/each}
			</div>
		</nav>
		<time class="clock" datetime={clockNow.toISOString()}
			>{dateLabel(today, { day: 'numeric', month: 'long', year: 'numeric' })}, {clockFormat.format(
				clockNow
			)}</time
		>
	</header>
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

	{#if view === 'month'}
		<div class="view-navigation">
			<h2>{dateLabel(monthDate, { month: 'long', year: 'numeric' })}</h2>
			<div class="date-nav">
				<button class="icon-button" aria-label="Previous month" onclick={() => moveMonth(-1)}
					><Icon name="left" /></button
				><button
					onclick={() => {
						monthDate = today;
						void loadCalendar(today);
					}}>Today</button
				><button class="icon-button" aria-label="Next month" onclick={() => moveMonth(1)}
					><Icon name="right" /></button
				><button
					class="icon-button"
					aria-label="Add event"
					onclick={() => (actionNotice = 'Add event')}><Icon name="plus" /></button
				>
			</div>
		</div>
		<div
			class="month-view"
			class:expanded-month={expandedMonthDate !== null}
			style:--weeks={grid.length / 7}
			style:grid-template-rows={expandedMonthDate
				? `24px ${Array.from({ length: grid.length / 7 }, (_, row) => (grid.slice(row * 7, row * 7 + 7).includes(expandedMonthDate!) ? `${Math.max(150, (eventIndex.get(expandedMonthDate!)?.length || 0) * 19 + 50)}px` : `minmax(${grid.length > 35 ? 86 : 104}px, 1fr)`)).join(' ')}`
				: undefined}
		>
			{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as weekday}<span
					class="month-weekday">{weekday}</span
				>{/each}
			{#each grid as date}
				{@const events = eventIndex.get(date) || []}
				<section class="month-cell" class:outside={date.slice(0, 7) !== monthDate.slice(0, 7)}>
					<button
						class="month-date"
						class:today={date === today}
						aria-label={dateLabel(date, {
							weekday: 'long',
							day: 'numeric',
							month: 'long',
							year: 'numeric'
						})}
						onclick={() => {
							navigate(date);
							view = 'day';
							followToken++;
						}}>{Number(date.slice(8))}</button
					>
					{#each expandedMonthDate === date ? events : events.slice(0, grid.length > 35 ? 2 : 3) as event (event.id)}<button
							class="month-event"
							class:all-day={event.kind === 'all-day'}
							style:--calendar-color={snapshot.calendars.find((c) => c.id === event.calendarId)
								?.color}
							onclick={() => (detail = event)}
							title={event.title}
							><span
								>{event.kind === 'timed'
									? `${timeLabel(event.start, snapshot.timeZone)} `
									: ''}{event.title}</span
							></button
						>{/each}
					{#if events.length > (grid.length > 35 ? 2 : 3)}<button
							class="month-more"
							aria-expanded={expandedMonthDate === date}
							aria-label={`${expandedMonthDate === date ? 'Collapse' : 'Expand'} events for ${date}`}
							onclick={() => (expandedMonthDate = expandedMonthDate === date ? null : date)}
							>{expandedMonthDate === date
								? 'Less'
								: `+${events.length - (grid.length > 35 ? 2 : 3)} more`}</button
						>{/if}
				</section>
			{/each}
		</div>
	{:else if view === 'schedule'}
		<div class="view-navigation">
			<h2>Schedule</h2>
			<div class="date-nav">
				<button
					onclick={() => {
						navigate(today);
						void loadCalendar(today);
						now = new Date();
						followToken++;
					}}>Today</button
				><button
					class="icon-button"
					aria-label="Add event"
					onclick={() => (actionNotice = 'Add event')}><Icon name="plus" /></button
				>
			</div>
		</div>
		<ScheduleView
			index={eventIndex}
			from={snapshot.from}
			to={snapshot.to}
			{today}
			{now}
			calendars={snapshot.calendars}
			timeZone={snapshot.timeZone}
			token={followToken}
			onopen={(e) => (detail = e)}
		/>
	{:else if view === 'week'}
		<div class="week-navigation">
			<span
				>{dateLabel(dayDates[0], { day: 'numeric', month: 'short' })} – {dateLabel(dayDates[6], {
					day: 'numeric',
					month: 'short'
				})}</span
			>{@render dateControls()}
		</div>
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
					<AllDayStrip
						resetToken={collapseToken}
						events={eventIndex.get(date) || []}
						calendars={snapshot.calendars}
						onopen={(e) => (detail = e)}
					/>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions must support keyboard scrolling.) -->
					<div
						class="week-events scroll-area"
						role="region"
						tabindex="0"
						aria-label={`${date} events`}
					>
						{#each (eventIndex.get(date) || []).filter((e) => e.kind === 'timed') as event (event.id)}<EventCard
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
			style:--columns={view === '2' || view === '3' ? Number(view) : 1}
		>
			{#each dayDates as date, i (date)}<DayAgenda
					{date}
					{today}
					events={eventIndex.get(date) || []}
					calendars={snapshot.calendars}
					timeZone={snapshot.timeZone}
					{now}
					dense={view === '3'}
					controls={i === 0 ? dateControls : undefined}
					token={followToken}
					resetToken={collapseToken}
					onopen={(e) => (detail = e)}
				/>{/each}
			{#if view === 'day'}<aside class="pinned-reminders" aria-label="Reminders">
					{@render reminderContents()}
				</aside>{/if}
		</div>
	{/if}
	{#if view !== 'day'}<button
			class="dock-handle"
			aria-label={`Open reminders, ${dayReminders.completed} of ${dayReminders.total} completed on ${dockDate}`}
			aria-expanded={dockOpen}
			onclick={() => (dockOpen = true)}
			><span class="handle-grip"></span><Icon name="check" size={18} /><span
				>{dayReminders.completed}/{dayReminders.total}</span
			></button
		>
	{/if}
	<button
		class="settings-reveal icon-button"
		class:revealed={showSettings}
		aria-label="Display settings"
		onclick={() => (modal = 'settings')}><Icon name="menu" /></button
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
		<div class="form-actions">
			<button title="Google connection required" onclick={() => (actionNotice = 'Edit event')}
				>Edit</button
			><button
				class="quiet-danger"
				title="Google connection required"
				onclick={() => (actionNotice = 'Delete event')}>Delete</button
			>
		</div>
		<p class="management-hint">Google connection required for changes.</p>
	</Modal>
{/if}
{#if modal === 'settings'}
	<Modal title="Display settings" onclose={() => (modal = null)}>
		<p class="muted">
			{snapshot.source === 'demo'
				? 'Sample events · Google is not connected.'
				: 'Google is not connected.'}
		</p>
		<h3>Appearance</h3>
		<div class="theme-options">
			<button
				class:chosen={theme === 'warm'}
				onclick={() => (theme = 'warm')}
				aria-pressed={theme === 'warm'}><span class="theme-swatch warm"></span>Warm</button
			><button
				class:chosen={theme === 'dark'}
				onclick={() => (theme = 'dark')}
				aria-pressed={theme === 'dark'}><span class="theme-swatch dark"></span>Dark</button
			>
		</div>
		<h3>Inactivity</h3>
		<label for="idle-return" class="muted"
			>Hide menu, collapse all-day rows and return to current event</label
		><select id="idle-return" bind:value={idleSeconds}
			><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option
				value={60}>1 minute</option
			><option value={0}>Off</option></select
		>
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
	<Modal title="All reminders" onclose={() => (modal = null)}>
		<div class="list-actions">
			<button onclick={() => (actionNotice = 'Add reminder')}
				><Icon name="plus" />Add reminder</button
			><button onclick={() => (actionNotice = 'Manage reminders')}>Manage</button>
		</div>
		{#if reminderWriteFailure}<p role="alert" class="error-message">{reminderWriteFailure}</p>{/if}
		{#each [{ title: 'Due', items: outstanding.filter((r) => !r.dueDate || r.dueDate === today || (r.kind !== 'note' && r.dueDate < today)) }, { title: 'Upcoming', items: outstanding.filter((r) => r.dueDate && r.dueDate > today) }, { title: 'Past notes', items: reminders.filter((r) => r.kind === 'note' && r.dueDate && r.dueDate < today) }, { title: 'Completed', items: reminders.filter((r) => r.completedAt) }] as group}
			<h3>{group.title} <span class="muted">{group.items.length}</span></h3>
			<ReminderList
				reminders={group.items}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>
			{#if !group.items.length}<p class="muted">None</p>{/if}
		{/each}
	</Modal>
{/if}

{#if reminderDetail}
	<Modal
		title={reminderDetail.kind === 'note' ? 'Note' : 'Reminder'}
		onclose={() => (reminderDetail = null)}
	>
		<span class="muted">{reminderDetail.list}</span>
		<h2 class="detail-title">{reminderDetail.title}</h2>
		{#if reminderDetail.dueDate}<p class="detail-time">
				{dateLabel(reminderDetail.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}
			</p>{/if}
		{#if reminderDetail.notes}<p class="detail-description">{reminderDetail.notes}</p>{/if}
		<p class="management-hint">
			Edit or delete from the management page on your phone or computer.
		</p>
		<a class="action-link" href={`/manage?reminder=${encodeURIComponent(reminderDetail.id)}`}
			>Open editor</a
		>
	</Modal>
{/if}
{#if actionNotice}
	<Modal title={actionNotice} onclose={() => (actionNotice = null)}>
		{#if actionNotice.includes('event')}
			<p class="detail-description">
				Google Calendar is not connected yet. Event creation, editing and deletion will be available
				here after integration.
			</p>
			<p class="management-hint">
				Forms will open on your phone or computer. The display stays keyboard-free.
			</p>
		{:else}
			<p class="detail-description">
				Use the management page on your phone or computer to add, edit and delete reminders.
			</p>
		{/if}
		<a class="action-link" href={actionNotice.includes('event') ? '/manage#events' : '/manage'}
			>Open management</a
		>
	</Modal>
{/if}

{#snippet reminderContents()}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling for the drawer.) -->
	<div
		class="dock-scroll scroll-area"
		role="region"
		tabindex="0"
		aria-label={`Reminders for ${dockDate}`}
	>
		<h3 class="dock-section-label dock-today">
			{dockDate === today ? 'Today' : dateLabel(dockDate, { day: 'numeric', month: 'short' })}
		</h3>
		<ReminderList
			reminders={due}
			{today}
			{busy}
			ontoggle={toggleReminder}
			onopen={(r) => (reminderDetail = r)}
		/>
		{#if !due.length}<p class="empty-state">
				{dayReminders.total ? 'All done for this day' : 'Nothing due this day'}
			</p>{/if}
		{#if dayReminders.completed}<details class="dock-completed">
				<summary>Completed · {dayReminders.completed}</summary><ReminderList
					reminders={dayReminders.items.filter((r) => r.completedAt)}
					{today}
					{busy}
					ontoggle={toggleReminder}
					onopen={(r) => (reminderDetail = r)}
				/>
			</details>{/if}
		{#if outstanding.some((r) => r.kind !== 'note' && r.dueDate && r.dueDate < dockDate)}<h3
				class="dock-section-label"
			>
				Unfinished
			</h3>
			<ReminderList
				reminders={outstanding.filter(
					(r) => r.kind !== 'note' && r.dueDate && r.dueDate < dockDate
				)}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>{/if}
		{#if outstanding.some((r) => !r.dueDate)}<h3 class="dock-section-label">Anytime</h3>
			<ReminderList
				reminders={outstanding.filter((r) => !r.dueDate)}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>{/if}
	</div>
	{#if reminderWriteFailure}<p role="alert" class="error-message">{reminderWriteFailure}</p>{/if}
	<footer class="dock-footer">
		<span
			>{dateLabel(dockDate, { day: 'numeric', month: 'short' })} · {dayReminders.completed}/{dayReminders.total}
			done</span
		>
		<div>
			<button
				class="icon-button"
				aria-label="All reminders"
				onclick={() => {
					dockOpen = false;
					modal = 'reminders';
				}}><Icon name="list" /></button
			><button
				class="icon-button"
				aria-label="Add reminder"
				onclick={() => {
					dockOpen = false;
					actionNotice = 'Add reminder';
				}}><Icon name="plus" /></button
			>
		</div>
	</footer>
{/snippet}
{#if dockOpen && view !== 'day'}
	<ReminderDock
		onclose={() => {
			dockOpen = false;
			interact();
		}}>{@render reminderContents()}</ReminderDock
	>
{/if}

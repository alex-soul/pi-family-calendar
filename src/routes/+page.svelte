<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { repeatLabel } from '#lib/recurrence.ts';
	import { canCompleteReminder } from '#lib/reminder-completion.ts';
	import { api } from '#lib/api.ts';
	import { plainDescription } from '#lib/description.ts';
	import { isBannerEvent } from '#lib/month.ts';
	import { addDays, dateKey, dateLabel, indexEvents, monthGrid, timeLabel } from '#lib/dates.ts';
	import type { CalendarEvent, CalendarSnapshot, Reminder } from '#lib/domain.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ViewIcon from '#lib/components/ViewIcon.svelte';
	import ReminderQr from '#lib/components/ReminderQr.svelte';
	import AddEventButton from '#lib/components/AddEventButton.svelte';
	import EventQr from '#lib/components/EventQr.svelte';
	import AddQrModal from '#lib/components/AddQrModal.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import SettingsMenu from '#lib/components/SettingsMenu.svelte';
	import DayAgenda from '#lib/components/DayAgenda.svelte';
	import WeekHeader from '#lib/components/WeekHeader.svelte';
	import EventCard from '#lib/components/EventCard.svelte';
	import ReminderList from '#lib/components/ReminderList.svelte';
	import ReminderDock from '#lib/components/ReminderDock.svelte';
	import ScheduleView from '#lib/components/ScheduleView.svelte';
	import MonthView from '#lib/components/MonthView.svelte';
	import { remindersForDay } from '#lib/display.ts';
	import { inactivityPreferences, idleReached } from '#lib/inactivity.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let snapshot = $state<CalendarSnapshot>(untrack(() => data.snapshot));
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let now = $state(untrack(() => new Date(data.now)));
	let clockNow = $state(untrack(() => new Date(data.now)));
	let selectedDate = $state(untrack(() => data.today));
	let today = $derived(dateKey(clockNow, snapshot.timeZone));
	let view = $state<'day' | '2' | '3' | 'week' | 'month' | 'schedule'>('day');
	let theme = $state<'warm' | 'dark'>('dark');
	let hiddenCalendars = $state<string[]>([]);
	let modal = $state<'settings' | null>(null);
	let detail = $state<CalendarEvent | null>(null);
	let eventQrEnabled = $state(untrack(() => data.eventQrEnabled)),
		eventDetailsQr = $state(false),
		reminderDetailsQr = $state(false);
	let qrEnabled = $state(untrack(() => data.qrEnabled));
	let addContext = $state<{
		initialKind: 'event' | 'reminder';
		date: string;
		endDate?: string;
		allDay: boolean;
		reminderDate: string | null;
	} | null>(null);
	let reminderDetail = $state<Reminder | null>(null);
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
	let calendarBackground = $state(false);
	let slowCalendarLoad = $state(false);
	let showSettings = $state(true);
	let lastInteraction = Date.now();
	let pointerHeld = false;
	let followToken = $state(0);
	let scrollPending = true;
	let collapsePending = true;
	let dockOpen = $state(false);
	let resetScrollSeconds = $state<number | undefined>(15);
	let returnTodaySeconds = $state<number | undefined>(60);
	let headerCollapsed = $state(false);
	let calendarRequest = 0;
	let reminderRequest = 0;

	let visibleEvents = $derived(
		snapshot.events
			.filter((event) => !hiddenCalendars.includes(event.calendarId))
			.map((event) => ({ ...event, description: plainDescription(event.description) }))
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
	let unfinished = $derived(
		outstanding.filter((r) => !r.repeat && r.kind !== 'note' && r.dueDate && r.dueDate < dockDate)
	);
	let anytime = $derived(outstanding.filter((r) => !r.dueDate));
	let grid = $derived.by(() => {
		const dates = monthGrid(monthDate);
		while (dates.length > 28 && dates[dates.length - 7].slice(0, 7) !== monthDate.slice(0, 7))
			dates.splice(-7);
		return dates;
	});

	function interact() {
		lastInteraction = Date.now();
		scrollPending = true;
		collapsePending = true;
		showSettings = true;
	}
	async function loadCalendar(date: string, background = false) {
		const request = ++calendarRequest;
		calendarLoading = true;
		calendarBackground = background;
		slowCalendarLoad = false;
		const loadingTimer = setTimeout(() => {
			if (request === calendarRequest) slowCalendarLoad = true;
		}, 250);
		try {
			const next = await api<CalendarSnapshot>(`/api/calendar?date=${date}`);
			if (request === calendarRequest) {
				snapshot = next;
				if (!background) followToken++;
				calendarFailure = '';
			}
		} catch (cause) {
			if (request === calendarRequest)
				calendarFailure = `${(cause as Error).message} Calendar data may be incomplete for these dates.`;
		} finally {
			clearTimeout(loadingTimer);
			if (request === calendarRequest) {
				calendarLoading = false;
				slowCalendarLoad = false;
			}
		}
	}
	function navigate(date: string) {
		followToken++;
		selectedDate = date;
		if (calendarLoading || date < snapshot.from || addDays(date, 7) >= snapshot.to)
			void loadCalendar(date);
	}
	function returnToToday() {
		now = clockNow;
		selectedDate = today;
		if (view === 'month') {
			expandedMonthDate = null;
			monthDate = today;
			void loadCalendar(today);
		} else {
			navigate(today);
			if (view === 'schedule') void loadCalendar(today);
		}
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
		dockOpen = false;
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
	async function refreshReminders() {
		void api<{ enabled: boolean; eventQrEnabled: boolean }>('/api/qr/status')
			.then((s) => {
				qrEnabled = s.enabled;
				eventQrEnabled = s.eventQrEnabled;
				if (!s.enabled) reminderDetailsQr = false;
			})
			.catch(() => {});
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
		if (
			!reminder.completedAt &&
			!canCompleteReminder(reminder, dateKey(new Date(), snapshot.timeZone))
		)
			return;
		if (busy) return;
		busy = reminder.id;
		reminderWriteFailure = '';
		++reminderRequest;
		try {
			const updated = await api<Reminder>(`/api/reminders/${reminder.id}/complete`, {
				method: 'POST',
				body: JSON.stringify({
					version: reminder.version,
					completed: !reminder.completedAt,
					occurrenceDate: reminder.occurrenceDate
				})
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
			({ resetScrollSeconds, returnTodaySeconds } = inactivityPreferences(preferences));
			headerCollapsed = preferences.headerCollapsed === true;
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
			const elapsed = Date.now() - lastInteraction;
			if (!pointerHeld && elapsed >= 15_000) showSettings = false;
			if (
				!document.hidden &&
				!pointerHeld &&
				!modal &&
				!dockOpen &&
				!detail &&
				!reminderDetail &&
				!addContext
			) {
				if (scrollPending && idleReached(elapsed, resetScrollSeconds)) {
					now = clockNow;
					followToken++;
					scrollPending = false;
				}
				if (collapsePending && elapsed >= 15_000) {
					collapseToken++;
					collapsePending = false;
				}
				if (
					idleReached(elapsed, returnTodaySeconds) &&
					(selectedDate !== today ||
						(view === 'month' && monthDate.slice(0, 7) !== today.slice(0, 7)))
				) {
					returnToToday();
					collapseToken++;
				}
			}
		}, 1_000);
		const calendarTimer = setInterval(() => {
			if (
				!document.hidden &&
				!calendarLoading &&
				!modal &&
				!detail &&
				!reminderDetail &&
				!addContext &&
				!dockOpen
			)
				void loadCalendar(view === 'month' ? monthDate : selectedDate, true);
		}, 60_000);
		const timer = setInterval(() => {
			const next = new Date();
			clockNow = next;
			if (!document.hidden && !busy) void refreshReminders();
			if (
				!modal &&
				!dockOpen &&
				!detail &&
				!reminderDetail &&
				!addContext &&
				Date.now() - lastInteraction >= 15_000
			) {
				if (
					selectedDate === dateKey(now, snapshot.timeZone) &&
					dateKey(next, snapshot.timeZone) !== dateKey(now, snapshot.timeZone)
				)
					navigate(dateKey(next, snapshot.timeZone));
				now = next;
				if (
					!document.hidden &&
					!pointerHeld &&
					idleReached(Date.now() - lastInteraction, resetScrollSeconds)
				)
					followToken++;
			}
		}, 30_000);
		return () => {
			clearInterval(timer);
			clearInterval(calendarTimer);
			clearInterval(clockTimer);
		};
	});
	$effect(() => {
		if (ready) {
			document.documentElement.dataset.theme = theme;
			try {
				localStorage.setItem(
					'calendar-display-v1',
					JSON.stringify({
						theme,
						view,
						hiddenCalendars,
						resetScrollSeconds: resetScrollSeconds ?? null,
						returnTodaySeconds: returnTodaySeconds ?? null,
						headerCollapsed
					})
				);
			} catch {
				/* Optional preferences. */
			}
		}
	});
	function openNewEvent(date: string, last?: string, allDay = false) {
		addContext = { initialKind: 'event', date, endDate: last, allDay, reminderDate: date };
	}
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
	<nav class="header-date-nav" aria-label="Date navigation">
		<button
			class="icon-button"
			aria-label={view === 'month' ? 'Previous month' : 'Previous dates'}
			title="Previous"
			onclick={() =>
				view === 'month'
					? moveMonth(-1)
					: navigate(addDays(selectedDate, view === 'week' ? -7 : -1))}><Icon name="left" /></button
		>
		<button
			class="icon-button"
			class:current-date={view === 'month'
				? monthDate.slice(0, 7) === today.slice(0, 7)
				: selectedDate === today}
			aria-label="Today"
			title="Today"
			aria-pressed={view === 'month'
				? monthDate.slice(0, 7) === today.slice(0, 7)
				: selectedDate === today}
			onclick={returnToToday}><Icon name="today" /></button
		>
		<button
			class="icon-button"
			aria-label={view === 'month' ? 'Next month' : 'Next dates'}
			title="Next"
			onclick={() =>
				view === 'month' ? moveMonth(1) : navigate(addDays(selectedDate, view === 'week' ? 7 : 1))}
			><Icon name="right" /></button
		>
	</nav>
{/snippet}

<main class="appliance">
	<div class="header-shell" class:collapsed={headerCollapsed}>
		{#if !headerCollapsed}
			<header class="app-header" id="display-header">
				<div class="header-leading">
					<time class="clock" datetime={clockNow.toISOString()}>{clockFormat.format(clockNow)}</time
					>
					{#if view === 'month'}<span class="header-month"
							>{dateLabel(monthDate, { month: 'long', year: 'numeric' })}</span
						>{/if}
				</div>
				<nav aria-label="Calendar views">
					<div class="view-tabs">
						{#each [['day', 'Day'], ['2', '2 days'], ['3', '3 days'], ['week', '7 days'], ['month', 'Month'], ['schedule', 'Schedule']] as [id, label]}<button
								class:active={view === id}
								aria-pressed={view === id}
								aria-label={label}
								title={label}
								onclick={() => chooseView(id as typeof view)}><ViewIcon view={id} /></button
							>{/each}
					</div>
				</nav>
				{@render dateControls()}
			</header>
		{/if}
		<button
			class="header-toggle"
			aria-label={headerCollapsed ? 'Show header' : 'Hide header'}
			aria-expanded={!headerCollapsed}
			aria-controls="display-header"
			onclick={() => (headerCollapsed = !headerCollapsed)}
			><span class="divider-grip"></span></button
		>
	</div>
	{#if failure}<div class="status-banner" role="alert">
			{failure}<button
				onclick={() => {
					reminderWriteFailure = '';
					void loadCalendar(selectedDate);
					void refreshReminders();
				}}>Retry</button
			>
		</div>{/if}
	{#if calendarLoading && slowCalendarLoad && !calendarBackground}<div
			class="loading-line"
			role="status"
		>
			Loading dates…
		</div>{/if}
	{#if snapshot.sync?.stale || snapshot.sync?.message}<div class="status-banner" role="status">
			{snapshot.sync.message || 'Google data may be out of date.'}{#if snapshot.fetchedAt}<span>
					Last synced {new Date(snapshot.fetchedAt).toLocaleString()}.</span
				>{/if}
		</div>{/if}
	{#if snapshot.source === 'unconnected'}<div class="status-banner">
			No calendar source connected. Reminders are available locally.
		</div>{/if}

	{#if view === 'month'}
		<MonthView
			onadd={eventQrEnabled ? (date, last) => openNewEvent(date, last, true) : undefined}
			dates={grid}
			{monthDate}
			{today}
			events={visibleEvents}
			calendars={snapshot.calendars}
			timeZone={snapshot.timeZone}
			bind:expandedDate={expandedMonthDate}
			ondate={(date) => {
				navigate(date);
				view = 'day';
				followToken++;
			}}
			onopen={(event) => (detail = event)}
		/>
	{:else if view === 'schedule'}
		<div class="main-grid day-layout schedule-layout">
			<ScheduleView
				anchorDate={selectedDate}
				{snapshot}
				{hiddenCalendars}
				{today}
				{now}
				calendars={snapshot.calendars}
				timeZone={snapshot.timeZone}
				token={followToken}
				onopen={(e) => (detail = e)}
			/>
			<aside class="pinned-reminders" aria-label="Reminders">
				{@render reminderContents()}
			</aside>
		</div>
	{:else if view === 'week'}
		<div class="week-board">
			<WeekHeader
				dates={dayDates}
				timeZone={snapshot.timeZone}
				resetToken={collapseToken}
				events={visibleEvents}
				calendars={snapshot.calendars}
				onopen={(event) => (detail = event)}
				ondate={(date) => {
					navigate(date);
					view = 'day';
				}}
				onadd={eventQrEnabled ? (date, last) => openNewEvent(date, last, true) : undefined}
			/>
			<div class="week-grid">
				{#each dayDates as date}
					<section class="week-day" class:today={date === today}>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions support keyboard browsing.) -->
						<div
							class="week-events scroll-area"
							role="region"
							tabindex="0"
							aria-label={`${date} events`}
						>
							{#each (eventIndex.get(date) || []).filter((e) => !isBannerEvent(e, snapshot.timeZone)) as event (event.id)}
								<EventCard
									{date}
									{event}
									calendar={snapshot.calendars.find((c) => c.id === event.calendarId)}
									timeZone={snapshot.timeZone}
									{now}
									compact
									onopen={(e) => (detail = e)}
								/>
							{:else}<span class="week-empty">—</span>{/each}
						</div>
					</section>
				{/each}
			</div>
		</div>
	{:else}
		<div
			class="main-grid"
			class:day-layout={view === 'day'}
			class:two-day-layout={view === '2'}
			style:--columns={view === '2' || view === '3' ? Number(view) : 1}
		>
			{#each dayDates as date (date)}<DayAgenda
					{date}
					{today}
					events={eventIndex.get(date) || []}
					calendars={snapshot.calendars}
					timeZone={snapshot.timeZone}
					{now}
					dense={view === '3'}
					token={followToken}
					resetToken={collapseToken}
					onopen={(e) => (detail = e)}
				>
					{#snippet controls()}{#if eventQrEnabled}<AddEventButton
								{date}
								onadd={(date) => openNewEvent(date)}
							/>{/if}{/snippet}
				</DayAgenda>{/each}
			{#if view === 'day' || view === '2'}<aside class="pinned-reminders" aria-label="Reminders">
					{@render reminderContents()}
				</aside>{/if}
		</div>
	{/if}
	{#if view !== 'day' && view !== '2' && view !== 'schedule'}<button
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
		aria-label="Main menu"
		onclick={() => (modal = 'settings')}><Icon name="menu" /></button
	>
</main>

{#if detail}
	<Modal
		title="Event"
		side={snapshot.source === 'google' ? eventQrSide : undefined}
		bind:sideOpen={eventDetailsQr}
		onclose={() => {
			detail = null;
			eventDetailsQr = false;
		}}
	>
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
	<SettingsMenu
		calendars={snapshot.calendars}
		bind:hidden={hiddenCalendars}
		bind:theme
		bind:resetScrollSeconds
		bind:returnTodaySeconds
		onclose={() => (modal = null)}
	/>
{/if}

{#if reminderDetail}
	<Modal
		title={reminderDetail.kind === 'note' ? 'Note' : 'Reminder'}
		side={qrEnabled ? reminderQrSide : undefined}
		bind:sideOpen={reminderDetailsQr}
		onclose={() => {
			reminderDetail = null;
			reminderDetailsQr = false;
		}}
	>
		<h2 class="detail-title">{reminderDetail.title}</h2>
		{#if reminderDetail.dueDate}<p class="detail-time">
				{dateLabel(reminderDetail.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}
			</p>{/if}
		{#if reminderDetail.notes}<p class="detail-description">{reminderDetail.notes}</p>{/if}
		{#if reminderDetail.repeat}<p class="management-hint">{repeatLabel(reminderDetail)}</p>{/if}
	</Modal>
{/if}
{#snippet reminderContents()}
	{#if qrEnabled}<button
			class="qr-add icon-button add-circle"
			aria-label="Add reminder via QR code"
			onclick={() => {
				dockOpen = false;
				addContext = { initialKind: 'reminder', date: dockDate, allDay: false, reminderDate: null };
			}}><Icon name="plus" size={20} /></button
		>{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling for the drawer.) -->
	<div
		class="dock-scroll scroll-area"
		role="region"
		tabindex="0"
		aria-label={`Reminders for ${dockDate}`}
	>
		{#if due.length}
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
		{/if}
		{#if unfinished.length}
			<h3 class="dock-section-label" class:dock-today={!due.length}>Unfinished</h3>
			<ReminderList
				reminders={unfinished}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>
		{/if}
		{#if anytime.length}
			{#if due.length || unfinished.length}<hr class="reminder-group-divider" />{/if}
			<ReminderList
				reminders={anytime}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>
		{/if}
	</div>
	{#if reminderWriteFailure}<p role="alert" class="error-message">{reminderWriteFailure}</p>{/if}
{/snippet}
{#if dockOpen && view !== 'day' && view !== '2' && view !== 'schedule'}
	<ReminderDock
		onclose={() => {
			dockOpen = false;
			interact();
		}}>{@render reminderContents()}</ReminderDock
	>
{/if}

{#snippet eventQrSide()}{#if detail}<EventQr id={detail.id} />{/if}{/snippet}
{#snippet reminderQrSide()}{#if reminderDetail}<ReminderQr id={reminderDetail.id} />{/if}{/snippet}
{#if addContext}
	<AddQrModal
		{...addContext}
		eventEnabled={eventQrEnabled}
		reminderEnabled={qrEnabled}
		onclose={() => {
			addContext = null;
			interact();
		}}
	/>
{/if}

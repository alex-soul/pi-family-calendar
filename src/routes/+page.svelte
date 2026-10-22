<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import CalendarStrip from '#lib/components/CalendarStrip.svelte';
	import { repeatLabel } from '#lib/recurrence.ts';
	import { canCompleteReminder } from '#lib/reminder-completion.ts';
	import { api } from '#lib/api.ts';
	import { plainDescription } from '#lib/description.ts';
	import { isBannerEvent } from '#lib/month.ts';
	import {
		addDays,
		dateKey,
		dateLabel,
		indexEvents,
		monthGrid,
		timeLabel,
		startOfWeek
	} from '#lib/dates.ts';
	import type { CalendarEvent, CalendarSnapshot, Reminder } from '#lib/domain.ts';
	import Icon from '#lib/components/Icon.svelte';
	import DigitalClock from '#lib/components/DigitalClock.svelte';
	import ViewSelector from '#lib/components/ViewSelector.svelte';
	import DateNavigator from '#lib/components/DateNavigator.svelte';
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
	import ScheduleView from '#lib/components/ScheduleView.svelte';
	import MonthView from '#lib/components/MonthView.svelte';
	import { reminderWidgetSections } from '#lib/display.ts';
	import { inactivityPreferences, idleReached } from '#lib/inactivity.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let snapshot = $state<CalendarSnapshot>(untrack(() => data.snapshot));
	let reminders = $state<Reminder[]>(untrack(() => data.reminders));
	let now = $state(untrack(() => new Date(data.now)));
	let clockNow = $state(untrack(() => new Date(data.now)));
	let selectedDate = $state(untrack(() => data.today));
	let today = $derived(dateKey(clockNow, snapshot.timeZone));
	let view = $state<'day' | '2' | '3' | 'week' | 'calendar-week' | 'month' | 'schedule'>('day');
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
	let viewsCollapsed = $state(false);
	let scheduleAway = $state(false);
	let atToday = $derived(
		view === 'month'
			? monthDate.slice(0, 7) === today.slice(0, 7)
			: view === 'calendar-week'
				? startOfWeek(selectedDate) === startOfWeek(today)
				: selectedDate === today && (view !== 'schedule' || !scheduleAway)
	);
	let lastInteraction = Date.now();
	let pointerHeld = false;
	let followToken = $state(0);
	let scrollPending = true;
	let collapsePending = true;
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
			{
				length:
					view === 'week' || view === 'calendar-week'
						? 7
						: view === '2' || view === '3'
							? Number(view)
							: 1
			},
			(_, i) => addDays(view === 'calendar-week' ? startOfWeek(selectedDate) : selectedDate, i)
		)
	);
	let dockDate = $derived(['day', '2'].includes(view) ? selectedDate : today);
	let reminderSections = $derived(reminderWidgetSections(reminders, today, dockDate));
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
		const first = view === 'calendar-week' ? startOfWeek(date) : date;
		if (calendarLoading || first < snapshot.from || addDays(first, 7) >= snapshot.to)
			void loadCalendar(date);
	}
	function returnToToday() {
		now = clockNow;
		scheduleAway = false;
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
	function moveDates(direction: number) {
		if (view === 'month') moveMonth(direction);
		else
			navigate(
				addDays(
					selectedDate,
					direction *
						(view === 'week' || view === 'calendar-week'
							? 7
							: view === '2'
								? 2
								: view === '3'
									? 3
									: 1)
				)
			);
	}
	function chooseView(next: typeof view) {
		scheduleAway = false;
		selectedDate = today;
		if (next === 'month') {
			openMonth();
			return;
		}
		view = next;
		void loadCalendar(today);
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
			return true;
		} catch (cause) {
			reminderWriteFailure = (cause as Error).message;
			await refreshReminders();
		} finally {
			busy = null;
		}
	}
	async function completeDetail() {
		const reminder = reminderDetail;
		if (!reminder || reminder.completedAt || !canCompleteReminder(reminder, today)) return;
		if ((await toggleReminder(reminder)) && reminderDetail === reminder) {
			reminderDetail = null;
			reminderDetailsQr = false;
		}
	}
	onMount(() => {
		try {
			const preferences = JSON.parse(localStorage.getItem('calendar-display-v1') || '{}');
			if (preferences.theme === 'slate') theme = 'dark';
			else if (['warm', 'dark'].includes(preferences.theme)) theme = preferences.theme;
			({ resetScrollSeconds, returnTodaySeconds } = inactivityPreferences(preferences));
			headerCollapsed = preferences.headerCollapsed === true;
			if (
				['day', '2', '3', 'week', 'calendar-week', 'month', 'schedule'].includes(preferences.view)
			)
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
			if (!pointerHeld && elapsed >= 15_000) {
				showSettings = false;
				viewsCollapsed = true;
			}
			if (!document.hidden && !pointerHeld && !modal && !detail && !reminderDetail && !addContext) {
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
				!addContext
			)
				void loadCalendar(view === 'month' ? monthDate : selectedDate, true);
		}, 60_000);
		const timer = setInterval(() => {
			const next = new Date();
			clockNow = next;
			if (!document.hidden && !busy) void refreshReminders();
			if (
				!modal &&
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
	<DateNavigator
		month={view === 'month'}
		onprevious={() => moveDates(-1)}
		onnext={() => moveDates(1)}
	/>
{/snippet}

<main class="appliance" class:kiosk={page.url.searchParams.get('kiosk') === '1'}>
	<div class="header-shell" class:collapsed={headerCollapsed}>
		{#if !headerCollapsed}
			<header class="app-header" id="display-header">
				<nav aria-label="Calendar views">
					<ViewSelector
						{view}
						bind:collapsed={viewsCollapsed}
						onselect={(id) => chooseView(id as typeof view)}
					/>
				</nav>
				<div class="header-clock">
					<DigitalClock value={clockFormat.format(clockNow)} instant={clockNow.toISOString()} />
				</div>
				<div class="header-date-group">
					{#if view === 'month'}<span class="header-month"
							>{dateLabel(monthDate, { month: 'long', year: 'numeric' })}</span
						>{/if}
					{@render dateControls()}
				</div>
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
			{reminders}
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
				{reminders}
				anchorDate={selectedDate}
				onawaychange={(away) => (scheduleAway = away)}
				{snapshot}
				{hiddenCalendars}
				{today}
				{now}
				calendars={snapshot.calendars}
				timeZone={snapshot.timeZone}
				token={followToken}
				onopen={(e) => (detail = e)}
				onreminder={(r) => (reminderDetail = r)}
				ondate={(date) => {
					navigate(date);
					view = 'day';
					followToken++;
				}}
			/>
			<aside class="pinned-reminders" aria-label="Reminders">
				{@render reminderContents()}
			</aside>
		</div>
	{:else}
		<div
			class="date-layout"
			class:with-reminders={view === 'day' || view === '2'}
			class:two-days={view === '2'}
		>
			<CalendarStrip
				first={dayDates[0]}
				count={dayDates.length}
				week={view === 'calendar-week'}
				gap={view === 'week' || view === 'calendar-week' ? 9 : view === '2' ? 18 : 22}
				context={view}
				enabled={!modal && !detail && !reminderDetail && !addContext}
				onmove={(days) => {
					interact();
					navigate(addDays(selectedDate, days));
				}}
			>
				{#snippet children(stripDates: string[], positions: Map<string, number>)}
					{#if view === 'week' || view === 'calendar-week'}
						<div class="week-board" class:calendar-week={view === 'calendar-week'}>
							{#if view === 'calendar-week'}<div class="week-column-shading" aria-hidden="true">
									{#each stripDates as date (date)}<span class:current={date === today}
										></span>{/each}
								</div>{/if}
							<WeekHeader
								{reminders}
								{today}
								dates={stripDates}
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
								{#each stripDates as date (date)}
									<section class="week-day" class:today={date === today}>
										<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable regions support keyboard browsing.) -->
										<div
											class="week-events scroll-area"
											data-scroll-date={date}
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
							class="agenda-page"
							style:--columns={dayDates.length}
							style:--day-gap={view === '2' ? '18px' : '22px'}
						>
							{#each stripDates as date (date)}<DayAgenda
									ondate={view === '2' || view === '3'
										? (day) => {
												navigate(day);
												view = 'day';
											}
										: undefined}
									{reminders}
									{date}
									{today}
									events={eventIndex.get(date) || []}
									calendars={snapshot.calendars}
									timeZone={snapshot.timeZone}
									{now}
									dense={view === '3'}
									token={followToken}
									initialScroll={positions.get(date)}
									resetToken={collapseToken}
									onopen={(e) => (detail = e)}
								>
									{#snippet controls()}{#if eventQrEnabled}<AddEventButton
												{date}
												onadd={(date) => openNewEvent(date)}
											/>{/if}{/snippet}
								</DayAgenda>{/each}
						</div>
					{/if}
				{/snippet}
			</CalendarStrip>
			{#if view === 'day' || view === '2'}<aside class="pinned-reminders" aria-label="Reminders">
					{@render reminderContents()}
				</aside>{/if}
		</div>
	{/if}
	{#if !atToday}
		<button
			class="today-return corner-control icon-button"
			aria-label="Today"
			title="Today"
			onclick={returnToToday}><Icon name="today" /></button
		>
	{/if}
	<button
		class="settings-reveal corner-control icon-button"
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
		title={reminderDetail.kind === 'note' ? 'Note' : 'To do'}
		heading={reminderDetail.kind === 'todo' ? reminderHeading : undefined}
		side={qrEnabled ? reminderQrSide : undefined}
		bind:sideOpen={reminderDetailsQr}
		onclose={() => {
			reminderDetail = null;
			reminderDetailsQr = false;
		}}
	>
		<h2 class="detail-title">{reminderDetail.title}</h2>
		{#if reminderWriteFailure}<p role="alert" class="error-message">{reminderWriteFailure}</p>{/if}
		{#if reminderDetail.dueDate}<p class="detail-time">
				{dateLabel(reminderDetail.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}
			</p>{/if}
		{#if reminderDetail.notes}<p class="detail-description">{reminderDetail.notes}</p>{/if}
		{#if reminderDetail.repeat}<p class="management-hint">{repeatLabel(reminderDetail)}</p>{/if}
	</Modal>
{/if}
{#snippet reminderHeading()}
	<div class="reminder-detail-heading">
		<h2>To do</h2>
		{@render reminderCompletion()}
	</div>
{/snippet}
{#snippet reminderCompletion()}
	{#if reminderDetail}
		<button
			class="primary-button detail-complete"
			disabled={!!busy ||
				!!reminderDetail.completedAt ||
				!canCompleteReminder(reminderDetail, today)}
			title={reminderDetail.dueDate && reminderDetail.dueDate > today
				? 'Available on its scheduled day'
				: undefined}
			onclick={completeDetail}
			><Icon name="check" size={18} />{reminderDetail.completedAt
				? 'Done'
				: reminderDetail.clearedAt
					? 'Cleared'
					: busy === reminderDetail.id
						? 'Saving…'
						: 'Mark as done'}</button
		>
	{/if}
{/snippet}
{#snippet reminderContents()}
	{#if qrEnabled}<button
			class="qr-add icon-button add-circle"
			aria-label="Add reminder via QR code"
			onclick={() => {
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
		<h3 class="dock-section-label dock-today reminder-context">
			{dockDate === today
				? 'Today'
				: dateLabel(dockDate, { weekday: 'short', day: 'numeric', month: 'short' })}
		</h3>
		{#each reminderSections as section (section.id)}
			{#if section.label}<h4 class="dock-section-label">{section.label}</h4>{/if}
			<ReminderList
				reminders={section.items}
				contextDate={section.contextDate}
				{today}
				{busy}
				ontoggle={toggleReminder}
				onopen={(r) => (reminderDetail = r)}
			/>
		{:else}
			<p class="reminder-empty">No reminders for this day.</p>
		{/each}
	</div>
	{#if reminderWriteFailure}<p role="alert" class="error-message">{reminderWriteFailure}</p>{/if}
{/snippet}
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

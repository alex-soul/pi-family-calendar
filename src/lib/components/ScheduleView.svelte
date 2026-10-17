<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import type { Calendar, CalendarEvent, CalendarSnapshot, Reminder } from '../domain.ts';
	import { addDays, dateLabel } from '../dates.ts';
	import { scheduleTime, eventDayNumber } from '../month.ts';
	import { scheduleFocusIndex } from '../display.ts';
	import { followCurrent } from '../follow-current.ts';
	import { combinedScheduleRows } from '../schedule.ts';
	import ReminderSummary from './ReminderSummary.svelte';
	import { api } from '../api.ts';
	let {
		snapshot,
		reminders,
		hiddenCalendars,
		today,
		anchorDate,
		now,
		calendars,
		timeZone,
		token,
		onopen,
		onreminder,
		ondate
	}: {
		snapshot: CalendarSnapshot;
		reminders: Reminder[];
		hiddenCalendars: string[];
		today: string;
		anchorDate: string;
		now: Date;
		calendars: Calendar[];
		timeZone: string;
		token: number;
		onopen: (e: CalendarEvent) => void;
		onreminder: (r: Reminder) => void;
		ondate: (date: string) => void;
	} = $props();
	let pages = $state<CalendarSnapshot[]>([]);
	let loading = $state(false);
	let loadFailure = $state('');
	let refreshWarning = $state('');
	let scroller: HTMLDivElement;
	let endMarker: HTMLDivElement;
	let generation = 0;
	let baseKey = '';
	let inputUntil = 0;
	let previousTop = 0;
	let refreshBusy = false;
	let visibleDate = '';
	const refreshed = new Map<string, number>();
	let rows = $derived(combinedScheduleRows(pages, hiddenCalendars, reminders));
	let end = $derived(pages.at(-1)?.to || snapshot.to);
	let canLoad = $derived(end < '2100-01-01');
	let focus = $derived.by(() => {
		if (anchorDate === today) return scheduleFocusIndex(rows, today, now);
		const index = rows.findIndex((row) => row.date >= anchorDate);
		return index < 0 ? rows.length : index;
	});
	$effect(() => {
		const next = snapshot;
		untrack(() => {
			const key = JSON.stringify([
				next.from,
				next.to,
				next.source,
				next.timeZone,
				next.calendars.map((c) => c.id).sort()
			]);
			if (key !== baseKey) {
				generation++;
				baseKey = key;
				pages = [next];
				loading = false;
				refreshBusy = false;
				loadFailure = refreshWarning = '';
				refreshed.clear();
			} else {
				pages = [next, ...pages.slice(1)];
				void refreshVisible();
			}
		});
	});
	onDestroy(() => {
		generation++;
	});
	async function loadMore() {
		if (loading || !canLoad) return;
		const request = generation;
		const from = end;
		inputUntil = 0;
		loading = true;
		loadFailure = '';
		try {
			const next = await api<CalendarSnapshot>(`/api/calendar?from=${from}`);
			if (request !== generation) return;
			if (!next.fetchedAt || next.from !== from || next.to <= from)
				throw new Error(next.sync?.message || 'More events are unavailable.');
			const scrollTop = scroller.scrollTop;
			const focusToken = token;
			pages = [...pages, next];
			await tick();
			if (request !== generation) return;
			if (token === focusToken) scroller.scrollTo({ top: scrollTop, behavior: 'instant' });
			refreshed.set(from, Date.now());
			refreshWarning = next.sync?.stale ? 'Showing saved events. Connection will retry.' : '';
		} catch (cause) {
			if (request === generation) loadFailure = (cause as Error).message;
		} finally {
			if (request === generation) loading = false;
		}
	}
	async function refreshVisible() {
		const page = pages.slice(1).find((p) => visibleDate >= p.from && visibleDate < p.to);
		if (!page || refreshBusy || Date.now() - (refreshed.get(page.from) || 0) < 120_000) return;
		const request = generation;
		refreshBusy = true;
		refreshed.set(page.from, Date.now());
		try {
			const next = await api<CalendarSnapshot>(`/api/calendar?from=${page.from}`);
			if (request !== generation) return;
			if (!next.fetchedAt) throw new Error('Refresh unavailable');
			pages = pages.map((p) => (p.from === next.from ? next : p));
			refreshWarning = next.sync?.stale ? 'Showing saved events. Connection will retry.' : '';
		} catch {
			if (request === generation) refreshWarning = 'Showing saved events. Connection will retry.';
		} finally {
			if (request === generation) refreshBusy = false;
		}
	}
	function scrolling() {
		const down = scroller.scrollTop > previousTop;
		previousTop = scroller.scrollTop;
		const top = scroller.getBoundingClientRect().top;
		const elements = scroller.querySelectorAll<HTMLElement>('[data-date]');
		let low = 0,
			high = elements.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (elements[middle].getBoundingClientRect().bottom < top) low = middle + 1;
			else high = middle;
		}
		const visible = elements[low];
		visibleDate = visible?.dataset.date || '';
		void refreshVisible();
		if (
			down &&
			Date.now() < inputUntil &&
			!loadFailure &&
			endMarker.getBoundingClientRect().top < top + scroller.clientHeight + 240
		)
			void loadMore();
	}
	function browse() {
		inputUntil = Date.now() + 1500;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Focusable scroll region observes native keyboard, wheel and touch browsing; it does not override them.) -->
<div
	class="schedule-scroll scroll-area"
	bind:this={scroller}
	onscroll={scrolling}
	onwheel={browse}
	ontouchmove={browse}
	onpointerdown={browse}
	onpointermove={(event) => {
		if (event.buttons) browse();
	}}
	onkeydown={browse}
	role="region"
	aria-label="Schedule events"
	tabindex="0"
	use:followCurrent={token}
>
	{#each rows as row, i (`${row.date}:${row.event ? 'event:' + row.event.id : 'reminder:' + row.reminder!.id}`)}
		<div
			class="schedule-row"
			class:schedule-reminder={!!row.reminder}
			data-date={row.date}
			data-current={i === focus}
			class:new-day={i === 0 || rows[i - 1].date !== row.date}
			class:reminder-divider={!!row.reminder &&
				i > 0 &&
				rows[i - 1].date === row.date &&
				!!rows[i - 1].event}
			class:past={!!row.event &&
				(row.date < today ||
					(row.event.kind === 'timed' && Date.parse(row.event.end) <= now.getTime()))}
			style:--calendar-color={row.event
				? calendars.find((c) => c.id === row.event!.calendarId)?.color
				: undefined}
		>
			<button
				class="schedule-date"
				class:date-muted={i > 0 && rows[i - 1].date === row.date}
				class:today={row.date === today}
				aria-label={`Show ${dateLabel(row.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
				onclick={() => ondate(row.date)}
			>
				<strong>{dateLabel(row.date, { day: 'numeric' })}</strong><small
					>{dateLabel(row.date, { month: 'short' })}, {dateLabel(row.date, {
						weekday: 'short'
					})}</small
				>
			</button>
			{#if row.event}
				{@const event = row.event}
				{@const progress = eventDayNumber(event, row.date, timeZone)}
				<button class="schedule-entry" onclick={() => onopen(event)}>
					<span class="schedule-time">{scheduleTime(event, row.date, timeZone)}</span>
					<span class="schedule-copy"
						><strong
							>{event.title}{#if progress.total > 1}
								<span class="schedule-progress">(Day {progress.day}/{progress.total})</span
								>{/if}</strong
						>{#if event.description}<span>{event.description}</span>{/if}</span
					>
				</button>
			{:else if row.reminder}
				<button
					class="schedule-entry"
					onclick={() => onreminder(row.reminder!)}
					aria-label={`Open ${row.reminder.title}`}
				>
					<span class="schedule-time reminder-state"
						>{row.reminder.kind === 'note' ? 'Note' : 'To do'}</span
					>
					<ReminderSummary reminder={row.reminder} {today} overdueOnly />
				</button>
			{/if}
		</div>
	{/each}

	<div class="schedule-end" bind:this={endMarker} data-current={focus === rows.length}>
		{#if refreshWarning}<p role="status">{refreshWarning}</p>{/if}
		{#if loadFailure}<p role="alert">{loadFailure}</p>{/if}
		{#if canLoad}
			<button class="schedule-load" disabled={loading} onclick={loadMore}>
				{loading ? 'Loading…' : loadFailure ? 'Retry loading events' : 'Load next 6 weeks'}
			</button>
			<span class="management-hint"
				>Through {dateLabel(addDays(end, -1), {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})}</span
			>
		{/if}
	</div>
	<div class="scroll-tail" aria-hidden="true"></div>
</div>

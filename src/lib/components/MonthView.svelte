<script lang="ts">
	import type { Calendar, CalendarEvent, Reminder } from '../domain.ts';
	import ReminderBubble from './ReminderBubble.svelte';
	import { remindersForDay, orderReminders } from '../display.ts';
	import { dateLabel } from '../dates.ts';
	import { monthWeek, dayTime, eventDates } from '../month.ts';
	let {
		dates,
		reminders,
		monthDate,
		today,
		events,
		calendars,
		timeZone,
		expandedDate = $bindable(null),
		ondate,
		onopen,
		onadd
	}: {
		dates: string[];
		reminders: Reminder[];
		monthDate: string;
		today: string;
		events: CalendarEvent[];
		calendars: Calendar[];
		timeZone: string;
		expandedDate: string | null;
		ondate: (date: string) => void;
		onadd?: (date: string, last: string) => void;
		onopen: (event: CalendarEvent) => void;
	} = $props();
	let dailyReminders = $derived(
		new Map(dates.map((date) => [date, orderReminders(remindersForDay(reminders, date).items)]))
	);
	let gridElement: HTMLDivElement;
	let selectionStart = $state('');
	let selectionEnd = $state('');
	let pointer: number | null = null;
	const firstSelected = $derived(selectionStart < selectionEnd ? selectionStart : selectionEnd);
	const lastSelected = $derived(selectionStart > selectionEnd ? selectionStart : selectionEnd);
	function cancelSelection() {
		selectionStart = selectionEnd = '';
		pointer = null;
	}
	function startSelection(event: PointerEvent, date: string) {
		if (!onadd || !event.isPrimary || event.button !== 0) return;
		selectionStart = selectionEnd = date;
		pointer = event.pointerId;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}
	function moveSelection(event: PointerEvent) {
		if (pointer !== event.pointerId) return;
		for (const cell of gridElement.querySelectorAll<HTMLElement>('[data-month-date]')) {
			const rect = cell.getBoundingClientRect();
			if (
				event.clientX >= rect.left &&
				event.clientX < rect.right &&
				event.clientY >= rect.top &&
				event.clientY < rect.bottom
			) {
				selectionEnd = cell.dataset.monthDate!;
				break;
			}
		}
	}
	function finishSelection(event: PointerEvent) {
		if (pointer !== event.pointerId) return;
		moveSelection(event);
		const rect = gridElement.getBoundingClientRect();
		if (
			event.clientX >= rect.left &&
			event.clientX < rect.right &&
			event.clientY >= rect.top &&
			event.clientY < rect.bottom
		)
			onadd?.(firstSelected, lastSelected);
		cancelSelection();
	}
	let limit = $derived(dates.length > 35 ? 2 : 3);
	let weeks = $derived(
		Array.from({ length: dates.length / 7 }, (_, i) => {
			const days = dates.slice(i * 7, i * 7 + 7),
				segments = monthWeek(events, days, timeZone);
			const expanded = expandedDate !== null && days.includes(expandedDate);
			return {
				days,
				reminderSpace: days.some((date) => dailyReminders.get(date)?.length) ? 28 : 0,
				segments,
				expanded,
				overflow: segments.some((s) => s.lane >= limit),
				lanes: expanded ? Math.max(limit, ...segments.map((s) => s.lane + 1)) : limit
			};
		})
	);
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') cancelSelection();
	}}
/>

<div
	bind:this={gridElement!}
	class="month-view spanning-month"
	style:grid-template-rows={`24px ${weeks.map((w) => (w.expanded ? `${28 + w.lanes * 21 + Math.max(w.overflow ? 19 : 0, w.reminderSpace)}px` : `minmax(${28 + w.lanes * 21 + Math.max(w.overflow ? 19 : 0, w.reminderSpace)}px,1fr)`)).join(' ')}`}
>
	<div class="month-weekdays">
		{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as day}<span class="month-weekday"
				>{day}</span
			>{/each}
	</div>
	{#each weeks as week}
		<section
			class="month-week"
			style:grid-template-rows={`28px repeat(${week.lanes},21px) ${Math.max(week.overflow ? 19 : 0, week.reminderSpace)}px minmax(0,1fr)`}
		>
			{#each week.days as date, col}
				<div
					class="month-cell"
					data-month-date={date}
					class:range-selected={!!selectionStart && date >= firstSelected && date <= lastSelected}
					class:outside={date.slice(0, 7) !== monthDate.slice(0, 7)}
					style:grid-column={col + 1}
					style:grid-row="1 / -1"
				>
					{#if onadd}<button
							class="month-create"
							aria-label={`Add all-day event on ${dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}`}
							onpointerdown={(event) => startSelection(event, date)}
							onpointermove={moveSelection}
							onpointerup={finishSelection}
							onpointercancel={cancelSelection}
							onlostpointercapture={cancelSelection}
							onclick={(event) => {
								if (event.detail === 0) onadd?.(date, date);
							}}
						></button>{/if}
					{#if dailyReminders.get(date)?.length}<div class="month-reminder-trigger">
							<ReminderBubble {date} items={dailyReminders.get(date)!} {today} />
						</div>{/if}
					<div class="month-date-actions">
						<button
							class="month-date"
							aria-label={dateLabel(date, {
								weekday: 'long',
								day: 'numeric',
								month: 'long',
								year: 'numeric'
							})}
							onclick={() => ondate(date)}
							><span class="month-day-number" class:today={date === today}
								>{Number(date.slice(8))}</span
							>{#if date.slice(8) === '01'}<span class="month-label"
									>{dateLabel(date, { month: 'short' })}</span
								>{/if}</button
						>
					</div>
				</div>
				{@const hidden = week.segments.filter(
					(s) => s.start <= col && s.end >= col && s.lane >= limit
				).length}
				{#if hidden > 0}<button
						class="month-more"
						style:grid-column={col + 1}
						style:grid-row={week.lanes + 2}
						aria-expanded={week.expanded}
						aria-label={`${week.expanded ? 'Collapse' : 'Expand'} events for ${date}`}
						onclick={() => (expandedDate = week.expanded ? null : date)}
						>{week.expanded ? 'Less' : `+${hidden} more`}</button
					>{/if}
			{/each}
			{#each week.segments.filter((s) => s.lane < week.lanes) as segment (segment.event.id)}
				{@const event = segment.event}
				{@const range = eventDates(event, timeZone)}
				<button
					class="month-event"
					class:all-day={event.kind === 'all-day'}
					class:multi-day={range.first !== range.last}
					class:continues-before={segment.continuesBefore}
					class:continues-after={segment.continuesAfter}
					style:grid-column={`${segment.start + 1} / ${segment.end + 2}`}
					style:grid-row={segment.lane + 2}
					style:--calendar-color={calendars.find((c) => c.id === event.calendarId)?.color}
					aria-label={`${event.title}, ${range.first}${range.last !== range.first ? ` to ${range.last}` : ''}, ${event.kind === 'all-day' ? 'All day' : dayTime(event, week.days[segment.start], timeZone).summary}`}
					title={event.title}
					onclick={() => onopen(event)}
				>
					{#if segment.continuesBefore}<span class="span-edge" aria-hidden="true">‹</span>{/if}
					<span class="month-event-title"
						>{event.kind === 'timed'
							? `${dayTime(event, week.days[segment.start], timeZone).primary === 'Until' ? dayTime(event, week.days[segment.start], timeZone).summary : dayTime(event, week.days[segment.start], timeZone).primary} `
							: ''}{event.title}</span
					>
					{#if segment.continuesAfter}<span class="span-edge" aria-hidden="true">›</span>{/if}
				</button>
			{/each}
		</section>
	{/each}
</div>

<style>
	.month-reminder-trigger {
		position: absolute;
		right: 3px;
		bottom: 1px;
		z-index: 5;
	}
</style>

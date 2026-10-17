import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	agendaFocusIndex,
	remindersForDay,
	scheduleFocusIndex,
	orderReminders,
	reminderWidgetGroups
} from '../src/lib/display.ts';
import type { CalendarEvent, Reminder } from '../src/lib/domain.ts';

const timed = (id: string, start: string, end: string): CalendarEvent => ({
	id,
	title: id,
	calendarId: 'test',
	kind: 'timed',
	start,
	end
});
const events = [
	timed('finished', '2026-10-16T08:00:00Z', '2026-10-16T09:00:00Z'),
	timed('ongoing', '2026-10-16T09:30:00Z', '2026-10-16T11:00:00Z'),
	timed('overlap', '2026-10-16T10:00:00Z', '2026-10-16T10:30:00Z'),
	timed('next', '2026-10-16T12:00:00Z', '2026-10-16T13:00:00Z')
];
test('agenda focus retains ongoing overlaps and advances only after their end', () => {
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T10:15:00Z')), 1);
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T11:00:00Z')), 3);
	assert.equal(agendaFocusIndex(events, new Date('2026-10-16T13:00:00Z')), events.length);
	assert.equal(events.length, 4, 'past events must remain available to scroll back to');
});
test('schedule focuses a current timed event before today all-day and falls forward to the next date', () => {
	const allDay: CalendarEvent = {
		id: 'all',
		title: 'All day',
		calendarId: 'test',
		kind: 'all-day',
		startDate: '2026-10-16',
		endDate: '2026-10-18'
	};
	const rows = [
		{ date: '2026-10-16', event: allDay },
		...events.map((event) => ({ date: '2026-10-16', event })),
		{ date: '2026-10-17', event: allDay }
	];
	assert.equal(scheduleFocusIndex(rows, '2026-10-16', new Date('2026-10-16T10:15:00Z')), 2);
	assert.equal(scheduleFocusIndex(rows, '2026-10-16', new Date('2026-10-16T14:00:00Z')), 5);
	assert.equal(scheduleFocusIndex([], '2026-10-16', new Date()), 0);
});
test('day count excludes future, undated and overdue items but includes completed items due that day', () => {
	const item = (
		id: string,
		dueDate: string | null,
		completedAt: string | null = null
	): Reminder => ({
		kind: 'todo',
		id,
		title: id,
		list: 'Household',
		dueDate,
		completedAt,
		version: 1
	});
	const items = [
		item('due', '2026-10-16'),
		item('done', '2026-10-16', '2026-10-16T09:00:00Z'),
		item('future', '2026-10-17'),
		item('overdue', '2026-10-15'),
		item('undated', null),
		item('old done', '2026-10-14', '2026-10-14T09:00:00Z')
	];
	const result = remindersForDay(items, '2026-10-16');
	assert.equal(result.total, 2);
	assert.equal(result.completed, 1);
	assert.deepEqual(
		result.items.map((r) => r.id),
		['due', 'done']
	);
	assert.equal(remindersForDay(items, '2026-10-18').total, 0);
});

test('notes follow todos within a day without inflating completion counts', () => {
	const note: Reminder = {
		id: 'n',
		kind: 'note',
		title: 'School notice',
		list: 'Household',
		dueDate: '2026-10-16',
		completedAt: null,
		version: 1
	};
	const todo: Reminder = { ...note, id: 't', kind: 'todo', completedAt: '2026-10-16T09:00:00Z' };
	const future = { ...note, id: 'f', dueDate: '2026-10-17' };
	const items = [note, todo, future];
	const day = remindersForDay(items, '2026-10-16');
	assert.equal(day.total, 1);
	assert.equal(day.completed, 1);
	assert.deepEqual(
		orderReminders(day.items).map((r) => r.id),
		['t', 'n']
	);
	assert.deepEqual(
		items.map((r) => r.id),
		['n', 't', 'f'],
		'ordering must not mutate input'
	);
});

const widgetItem = (
	id: string,
	dueDate: string | null,
	extra: Partial<Reminder> = {}
): Reminder => ({
	id,
	title: id,
	dueDate,
	kind: 'todo',
	list: 'General',
	version: 1,
	completedAt: null,
	...extra
});
test('browsing preserves current groups and suppresses duplicate Today and resolved tasks', () => {
	const items = [
		widgetItem('today', '2026-10-17'),
		widgetItem('late', '2026-10-15'),
		widgetItem('future', '2026-12-24'),
		widgetItem('anytime', null),
		widgetItem('note', '2026-12-24', { kind: 'note' }),
		widgetItem('done', '2026-12-24', { completedAt: '2026-10-17T10:00:00Z' })
	];
	const ids = (items: Reminder[]) => items.map((r) => r.id);
	const future = reminderWidgetGroups(items, '2026-10-17', '2026-12-24');
	assert.deepEqual(ids(future.selected), ['future', 'note']);
	assert.deepEqual(ids(future.today), ['today']);
	assert.deepEqual(ids(future.overdue), ['late']);
	assert.deepEqual(ids(future.anytime), ['anytime']);
	assert.deepEqual(reminderWidgetGroups(items, '2026-10-17', '2026-10-17').selected, []);
	const past = reminderWidgetGroups(items, '2026-10-17', '2026-10-15');
	assert.deepEqual(ids(past.selected), ['late']);
	assert.deepEqual(past.overdue, [], 'selected overdue task appears only once');
	assert.deepEqual(past.today, future.today);
	assert.deepEqual(past.anytime, future.anytime);
	const emptyDate = reminderWidgetGroups(items, '2026-10-17', '2026-12-25');
	assert.deepEqual(emptyDate.selected, []);
	assert.deepEqual(emptyDate.today, future.today);
	assert.deepEqual(emptyDate.overdue, future.overdue);
});
test('overdue repeating task has one current action while future occurrence stays browsable', () => {
	const repeat = widgetItem('repeat', '2026-10-15', {
		repeat: { frequency: 'daily', interval: 1, until: null }
	});
	const future = reminderWidgetGroups([repeat], '2026-10-17', '2026-10-20');
	assert.equal(future.overdue.length, 1);
	assert.equal(future.overdue[0].dueDate, '2026-10-15');
	assert.deepEqual(future.today, []);
	assert.equal(future.selected[0].dueDate, '2026-10-20');
	const past = reminderWidgetGroups([repeat], '2026-10-17', '2026-10-16');
	assert.equal(past.selected[0].dueDate, '2026-10-16');
	assert.deepEqual(past.overdue, []);
	assert.deepEqual(past.today, []);
});

test('past selected dates retain notes, completed and cleared history without hiding other overdue tasks', () => {
	const items = [
		widgetItem('note', '2026-10-16', { kind: 'note' }),
		widgetItem('done', '2026-10-16', { completedAt: '2026-10-16T10:00:00Z' }),
		widgetItem('cleared', '2026-10-16', {
			repeat: { frequency: 'daily', interval: 1, until: null },
			completedDates: { '2026-10-17': '2026-10-17T10:00:00Z' },
			completionWindows: [
				{ date: '2026-10-16', through: '2026-10-17', completedAt: '2026-10-17T10:00:00Z' }
			]
		}),
		widgetItem('other overdue', '2026-10-15')
	];
	const groups = reminderWidgetGroups(items, '2026-10-17', '2026-10-16');
	assert.deepEqual(
		groups.selected.map((r) => r.id),
		['note', 'done', 'cleared']
	);
	assert.deepEqual(
		groups.overdue.map((r) => r.id),
		['other overdue']
	);
});

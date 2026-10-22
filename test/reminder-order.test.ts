import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarSnapshot, Reminder } from '../src/lib/domain.ts';
import { orderReminders, remindersForDay, reminderWidgetSections } from '../src/lib/display.ts';
import { reminderGroups } from '../src/lib/reminder-management.ts';
import { isReminderOverdue } from '../src/lib/reminder-time.ts';
import { combinedScheduleRows } from '../src/lib/schedule.ts';

const today = '2026-10-23';
const item = (id: string, changes: Partial<Reminder> = {}): Reminder => ({
	id,
	title: id,
	kind: 'todo',
	list: 'General',
	dueDate: today,
	completedAt: null,
	version: 1,
	...changes
});
const ids = (items: Reminder[]) => items.map((r) => r.id);
const widget = (items: Reminder[], date = today, time = '12:00') =>
	reminderWidgetSections(items, today, date, time).flatMap((s) => s.items);
const snapshot: CalendarSnapshot = {
	source: 'demo',
	from: '2026-10-22',
	to: '2026-10-25',
	events: [],
	calendars: [],
	timeZone: 'Europe/London',
	fetchedAt: `${today}T12:00:00Z`
};

test('Today follows the full agreed order, including all-day ToDos and same-day overdue work', () => {
	const rows = [
		item('evening task', { dueTime: '20:00' }),
		item('all-day task'),
		item('overdue today', { dueTime: '08:00' }),
		item('afternoon task', { dueTime: '13:00' }),
		item('undated task', { dueDate: null }),
		item('older overdue', { dueDate: '2026-10-21', dueTime: '20:00' }),
		item('yesterday overdue', { dueDate: '2026-10-22' }),
		item('timed note', { kind: 'note', showFrom: '11:00', showUntil: '13:00' }),
		item('all-day note', { kind: 'note' }),
		item('undated note', { kind: 'note', dueDate: null }),
		item('expired note', { kind: 'note', showFrom: '07:00', showUntil: '09:00' }),
		item('completed task', { completedAt: `${today}T09:00:00Z` })
	];
	const expected = [
		'undated note',
		'all-day note',
		'timed note',
		'undated task',
		'older overdue',
		'yesterday overdue',
		'overdue today',
		'all-day task',
		'afternoon task',
		'evening task'
	];
	assert.deepEqual(ids(widget(rows)), expected);
	assert.deepEqual(ids(widget([...rows].reverse())), expected);
	assert.equal(new Set(ids(widget(rows))).size, expected.length, 'No overdue duplication');
});

test('all-day before timed is shared by date bubbles, Schedule, selected-day widgets and admin groups', () => {
	for (const date of ['2026-10-22', '2026-10-24']) {
		const rows = [
			item('evening task', { dueDate: date, dueTime: '20:00' }),
			item('all-day task', { dueDate: date }),
			item('midnight task', { dueDate: date, dueTime: '00:00' }),
			item('morning task', { dueDate: date, dueTime: '08:00' }),
			item('timed note', { kind: 'note', dueDate: date, showFrom: '07:00', showUntil: '09:00' }),
			item('all-day note', { kind: 'note', dueDate: date }),
			item('unrelated undated', { dueDate: null })
		];
		const expected = [
			'all-day note',
			'timed note',
			'all-day task',
			'midnight task',
			'morning task',
			'evening task'
		];
		assert.deepEqual(ids(orderReminders(remindersForDay(rows, date, today).items)), expected);
		assert.deepEqual(
			ids(widget(rows, date, '23:00')),
			expected,
			'Past/future timed Notes remain inspectable'
		);
		assert.deepEqual(
			ids(
				combinedScheduleRows([snapshot], [], rows, today)
					.filter((r) => r.date === date)
					.map((r) => r.reminder!)
			),
			expected
		);
		for (const kind of ['todo', 'note'] as const) {
			const groups = reminderGroups(rows, today, 'all', '', '', '12:00', kind);
			const dated = groups.flatMap((g) => g.items).filter((r) => r.dueDate === date);
			assert.deepEqual(
				ids(dated),
				expected.filter((id) => id.endsWith(kind === 'todo' ? 'task' : 'note'))
			);
		}
	}
});

test('future template previews use all-day first without creating past or today previews', () => {
	const repeat = { frequency: 'daily' as const, interval: 1, until: null };
	const rows = [
		item('timed template', { repeat, dueTime: '08:00' }),
		item('all-day template', { repeat })
	];
	const future = widget(rows, '2026-10-24');
	assert.deepEqual(
		future.map((r) => r.title),
		['all-day template', 'timed template']
	);
	assert.ok(future.every((r) => r.preview && r.dueDate === '2026-10-24'));
	assert.deepEqual(widget(rows), []);
	assert.deepEqual(widget(rows, '2026-10-22'), []);
});

test('all-day ToDos become overdue the next day, while timed ToDos move at their due time', () => {
	const allDay = item('all-day task');
	const timed = item('timed task', { dueTime: '08:00' });
	assert.deepEqual(ids(widget([timed, allDay], today, '07:59')), ['all-day task', 'timed task']);
	assert.deepEqual(ids(widget([allDay, timed], today, '08:00')), ['timed task', 'all-day task']);
	assert.equal(isReminderOverdue(allDay, today, '23:59'), false);
	assert.equal(isReminderOverdue(allDay, '2026-10-24', '00:00'), true);
	assert.equal(
		isReminderOverdue({ ...timed, completedAt: `${today}T07:00:00Z` }, today, '08:00'),
		false
	);
});

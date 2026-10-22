import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderGroups } from '../src/lib/reminder-management.ts';
import type { Reminder } from '../src/lib/domain.ts';

const today = '2026-10-16';
const item = (id: string, changes: Partial<Reminder> = {}): Reminder => ({
	id,
	title: id,
	kind: 'todo',
	list: 'Household',
	dueDate: today,
	completedAt: null,
	version: 1,
	...changes
});
const fixtures = [
	item('due'),
	item('late', { dueDate: '2026-10-15' }),
	item('future-note', { kind: 'note', dueDate: '2026-10-20' }),
	item('past-note', { kind: 'note', dueDate: '2026-10-14' }),
	item('anytime-note', { kind: 'note', dueDate: null }),
	item('finished', { completedAt: '2026-10-16T12:00:00Z' })
];

test('management keeps active tasks, future notes and undated notes, without old notes or completed items', () => {
	assert.deepEqual(
		reminderGroups(fixtures, today, 'active').map((g) => [g.title, g.items.map((r) => r.id)]),
		[
			['Today', ['due']],
			['Overdue', ['late']],
			['Upcoming', ['future-note']],
			['Anytime', ['anytime-note']]
		]
	);
	assert.deepEqual(
		reminderGroups(fixtures, today, 'completed').flatMap((g) => g.items.map((r) => r.id)),
		['finished']
	);
	assert.equal(
		reminderGroups(fixtures, today, 'all').flatMap((g) => g.items).length,
		fixtures.length
	);
});

test('management search includes details and combines with list selection', () => {
	const items = [
		item('Pack bag', { notes: 'Swimming kit', list: 'Personal 1' }),
		item('Swimming', { list: 'Household' })
	];
	assert.deepEqual(
		reminderGroups(items, today, 'active', ' SWIMMING ', 'Personal 1').flatMap((g) =>
			g.items.map((r) => r.id)
		),
		['Pack bag']
	);
	assert.deepEqual(reminderGroups(items, today, 'active', 'missing'), []);
});

test('management orders upcoming dates then titles at equal times without mutating the source', () => {
	const items = [
		item('z', { dueDate: '2026-10-19' }),
		item('a', { kind: 'note', dueDate: '2026-10-17' }),
		item('b', { dueDate: '2026-10-17' })
	];
	assert.deepEqual(
		reminderGroups(items, today, 'active')[0].items.map((r) => r.id),
		['a', 'b', 'z']
	);
	assert.deepEqual(
		items.map((r) => r.id),
		['z', 'a', 'b']
	);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { requiresAdmin } from '../src/lib/server/admin.ts';

test('completed cleanup spans pages and preserves notes, pending tasks, templates and generation receipts', () => {
	let day = '2026-10-21';
	const r = new SqliteReminders(':memory:', () => day);
	try {
		const template = r.create({
			title: 'Daily task',
			kind: 'todo',
			list: 'General',
			dueDate: day,
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		const note = r.create({ title: 'Keep note', kind: 'note', list: 'General', dueDate: day });
		const pending = r.create({ title: 'Keep task', list: 'General', dueDate: day });
		day = '2026-10-22';
		r.generate(day, '00:00');
		const generated = r.list().find((x) => x.sourceTemplateId === template.id)!;
		r.complete(generated.id, generated.version, true);
		for (let i = 0; i < 205; i++) {
			const item = r.create({ title: `Done ${i}`, list: 'General', dueDate: day });
			r.complete(item.id, item.version, true);
		}
		assert.equal(r.page().length, 200);
		const summary = r.completedSummary();
		assert.equal(summary.count, 206);
		assert.equal(r.removeCompleted(summary.revision), 206);
		assert.deepEqual(
			r
				.list()
				.map((x) => x.id)
				.sort(),
			[template.id, note.id, pending.id].sort()
		);
		assert.equal(r.generate(day, '01:00').created, 0);
		assert.equal(r.completedSummary().count, 0);
		assert.equal(r.removeCompleted(r.completedSummary().revision), 0);
	} finally {
		r.close();
	}
});

test('completed cleanup rejects stale confirmations without deleting any items', () => {
	const r = new SqliteReminders(':memory:');
	try {
		const add = () => {
			const x = r.create({ title: 'Task', list: 'General', dueDate: null });
			return r.complete(x.id, x.version, true);
		};
		const first = add();
		const original = r.completedSummary();
		const second = add();
		assert.throws(() => r.removeCompleted(original.revision), /changed/);
		assert.equal(r.completedSummary().count, 2);
		const two = r.completedSummary();
		r.complete(first.id, first.version, false);
		assert.throws(() => r.removeCompleted(two.revision), /changed/);
		assert.ok(r.get(second.id).completedAt);
		const current = r.completedSummary();
		r.update(second.id, second.version, { ...second, title: 'Edited elsewhere' });
		assert.throws(() => r.removeCompleted(current.revision), /changed/);
		assert.throws(() => r.removeCompleted(null), /Review/);
		assert.equal(r.list().length, 2);
	} finally {
		r.close();
	}
});

test('bulk cleanup review and mutation require admin, unlike display completion', () => {
	for (const method of ['GET', 'HEAD', 'DELETE'])
		assert.equal(requiresAdmin('/api/admin/reminders/completed', method), true);
	assert.equal(requiresAdmin('/api/reminders/[id]/complete', 'POST'), false);
});

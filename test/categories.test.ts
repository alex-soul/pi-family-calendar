import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { requiresAdmin } from '../src/lib/server/admin.ts';
test('custom colours and expanded icons persist while malformed styles are rejected', () => {
	const r = new SqliteReminders(':memory:');
	try {
		const category = r.saveCategory({ name: 'Garden', color: '#12AbEF', icon: 'leaf' });
		const note = r.create({
			title: 'Water plants',
			kind: 'note',
			list: 'General',
			dueDate: null,
			categoryId: category.id
		});
		assert.equal(r.get(note.id).category?.color, '#12AbEF');
		assert.equal(r.get(note.id).category?.icon, 'leaf');
		for (const color of ['red', '#123', '#123456;display:none', '#xyzxyz', '']) {
			assert.throws(() => r.saveCategory({ name: 'Invalid', color, icon: 'leaf' }), /colour/);
		}
		assert.throws(
			() => r.saveCategory({ name: 'Invalid', color: '#123456', icon: 'not-an-icon' }),
			/icon/
		);
	} finally {
		r.close();
	}
});
test('categories style history, reassignment affects future only, deletion atomically falls back', () => {
	let day = '2026-10-20';
	const r = new SqliteReminders(':memory:', () => day);
	try {
		const a = r.saveCategory({ name: 'Birthdays', color: '#8b6bb1', icon: 'gift' });
		const b = r.saveCategory({ name: 'School', color: '#4f8b81', icon: 'calendar' });
		let template = r.create({
			title: 'Fixture',
			list: 'General',
			kind: 'note',
			categoryId: a.id,
			dueDate: day,
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		day = '2026-10-21';
		r.generate(day, '00:00');
		const item = r.list().find((v) => v.sourceTemplateId)!;
		template = r.update(template.id, template.version, { ...template, categoryId: b.id });
		assert.equal(r.get(item.id).categoryId, a.id);
		const styled = r.saveCategory(
			{ name: 'Celebrations', color: '#aa637e', icon: 'heart' },
			a.id,
			a.version
		);
		assert.equal(r.get(item.id).category?.name, 'Celebrations');
		r.removeCategory(a.id, styled.version);
		assert.equal(r.get(item.id).categoryId, 'general');
		assert.equal(r.get(template.id).categoryId, b.id);
		assert.throws(() => r.update(item.id, item.version, { ...item, categoryId: a.id }), /changed/);
		assert.throws(() => r.create({ ...item, categoryId: a.id }), /removed/);
		r.removeCategory(b.id, b.version);
		day = '2026-10-22';
		r.generate(day, '00:00');
		assert.ok(r.list().every((v) => v.categoryId === 'general'));
		assert.throws(() => r.removeCategory('general', 1));
		assert.throws(() =>
			r.saveCategory({ name: 'Changed', color: '#8b6bb1', icon: '' }, 'general', 1)
		);
		assert.equal(requiresAdmin('/api/categories', 'POST'), true);
		assert.equal(requiresAdmin('/api/categories', 'DELETE'), true);
	} finally {
		r.close();
	}
});
test('date queries retain only selected history plus templates and current actionable work', () => {
	const r = new SqliteReminders(':memory:', () => '2026-10-22');
	try {
		const create = (title: string, dueDate: string | null, kind: 'note' | 'todo' = 'note') =>
			r.create({ title, list: 'General', dueDate, kind });
		create('Old note', '2025-01-01');
		create('This note', '2026-10-22');
		create('Old task', '2025-01-01', 'todo');
		create('Anytime', null);
		assert.deepEqual(
			r
				.query('2026-10-20', '2026-11-01')
				.map((x) => x.title)
				.sort(),
			['Anytime', 'Old task', 'This note']
		);
		assert.throws(() => r.query('2020-01-01', '2026-01-01'));
		assert.ok(
			r.query('2027-01-01', '2027-02-01').some((x) => x.title === 'This note'),
			'Schedule keeps Today notes while browsing distant dates'
		);
	} finally {
		r.close();
	}
});

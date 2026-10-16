import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteReminders, ReminderError, validateReminder } from '../src/lib/server/reminders.ts';

test('reminders survive reopening, support completion/undo and reject stale edits', () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-test-'));
	const path = join(directory, 'test.sqlite');
	let store = new SqliteReminders(path);
	try {
		const added = store.create({
			title: '  Pack a bag  ',
			list: 'Household',
			dueDate: '2026-10-16'
		});
		assert.equal(added.title, 'Pack a bag');
		store.close();
		store = new SqliteReminders(path);
		assert.equal(store.list()[0].id, added.id);
		const completed = store.complete(added.id, added.version, true);
		assert.ok(completed.completedAt);
		assert.throws(
			() =>
				store.update(added.id, added.version, {
					title: 'Stale overwrite',
					list: 'Household',
					dueDate: null
				}),
			(e) => e instanceof ReminderError && e.status === 409
		);
		assert.throws(
			() => store.remove(added.id, added.version),
			(e) => e instanceof ReminderError && e.status === 409
		);
		const undone = store.complete(added.id, completed.version, false);
		assert.equal(undone.completedAt, null);
		const edited = store.update(added.id, undone.version, {
			title: 'New title',
			list: 'Personal 1',
			dueDate: null
		});
		assert.equal(edited.list, 'Personal 1');
		store.remove(added.id, edited.version);
		assert.deepEqual(store.list(), []);
		assert.throws(
			() => store.complete(added.id, edited.version, true),
			(e) => e instanceof ReminderError && e.status === 404
		);
	} finally {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
test('validation rejects blank titles, impossible dates and unknown list names', () => {
	for (const input of [
		null,
		{},
		{ title: '', list: 'Household', dueDate: null },
		{ title: 'Task', list: 'Household', dueDate: '2026-02-30' },
		{ title: 'Task', list: 'Unknown', dueDate: null }
	]) {
		assert.throws(() => validateReminder(input), ReminderError);
	}
});

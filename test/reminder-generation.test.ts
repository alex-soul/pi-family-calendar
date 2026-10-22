import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { generationSlot, startReminderScheduler } from '../src/lib/server/reminder-scheduler.ts';
import { reminderWidgetSections } from '../src/lib/display.ts';
import { isReminderOverdue, noteVisibleNow } from '../src/lib/reminder-time.ts';

const daily = { frequency: 'daily' as const, interval: 1, until: null };
const base = {
	title: 'Daily task',
	list: 'General',
	dueDate: '2026-10-16',
	repeat: daily,
	dueTime: '08:00'
};

test('generated items are independent snapshots; postponing and deleting templates preserve them', () => {
	let day = '2026-10-16';
	const store = new SqliteReminders(':memory:', () => day);
	try {
		let template = store.create(base);
		assert.equal(store.generate(day, '00:00').created, 0, 'creation day is not generated');
		day = '2026-10-17';
		assert.equal(store.generate(day, '00:00').created, 1);
		let first = store.list().find((r) => r.sourceTemplateId === template.id)!;
		assert.equal(first.repeat, null);
		assert.equal(first.dueTime, '08:00');
		template = store.update(template.id, template.version, {
			...template,
			title: 'Changed task',
			dueTime: '09:00'
		});
		assert.equal(store.list().find((r) => r.id === first.id)!.title, 'Daily task');
		first = store.update(first.id, first.version, { ...first, dueDate: '2026-10-18' });
		day = '2026-10-18';
		assert.equal(store.generate(day, '00:00').created, 1);
		assert.equal(store.list().filter((r) => !r.repeat && r.dueDate === day).length, 2);
		store.complete(first.id, first.version, true);
		assert.equal(store.list().filter((r) => r.completedAt).length, 1);
		store.remove(template.id, template.version);
		assert.equal(store.list().length, 2);
		assert.equal(store.generate(day, '01:00').created, 0);
	} finally {
		store.close();
	}
});

test('one retry repairs partial failure without resurrecting deleted items or adding new templates', () => {
	let day = '2026-10-16';
	const store = new SqliteReminders(':memory:', () => day);
	try {
		const first = store.create(base);
		const second = store.create({ ...base, title: 'Second task' });
		store.database.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON reminders
 WHEN json_extract(NEW.data,'$.title')='Second task' BEGIN SELECT RAISE(FAIL,'fixture failure'); END;`);
		day = '2026-10-17';
		assert.deepEqual(store.generate(day, '00:00'), { created: 1, failed: 1, skipped: false });
		const generated = store.list().find((r) => r.sourceTemplateId === first.id)!;
		store.remove(generated.id, generated.version);
		store.database.exec('DROP TRIGGER fail_second');
		store.create({ ...base, title: 'Added after midnight' });
		assert.deepEqual(store.generate(day, '01:00'), { created: 1, failed: 0, skipped: false });
		assert.deepEqual(
			store
				.list()
				.filter((r) => r.sourceTemplateId)
				.map((r) => r.sourceTemplateId),
			[second.id]
		);
		assert.equal(store.generate(day, '01:00').skipped, true);
	} finally {
		store.close();
	}
});

test('missing midnight permits only today at 1am, never a backfill', () => {
	let day = '2026-10-16';
	const store = new SqliteReminders(':memory:', () => day);
	try {
		store.create(base);
		day = '2026-10-19';
		assert.throws(() => store.generate('2026-10-18', '01:00'), /current scheduled day/);
		assert.equal(store.generate(day, '01:00').created, 1);
		assert.deepEqual(
			store
				.list()
				.filter((r) => r.sourceDate)
				.map((r) => r.sourceDate),
			[day]
		);
	} finally {
		store.close();
	}
});

test('scheduler skips startup catchup and accepts only a timely scheduled boundary, including DST', (t) => {
	const midnight = Date.parse('2026-10-16T23:00:00Z');
	assert.equal(generationSlot(midnight, midnight + 5000, 'Europe/London'), '00:00');
	assert.equal(generationSlot(midnight, midnight + 5001, 'Europe/London'), null);
	assert.equal(generationSlot(midnight, midnight - 1, 'Europe/London'), null);
	for (const date of ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z']) {
		const epoch = Date.parse(date);
		assert.equal(generationSlot(epoch, epoch, 'Europe/London'), '01:00');
	}
	const spring = Date.parse('2026-03-29T01:00:00Z');
	assert.equal(generationSlot(spring, spring, 'Europe/London'), null);
	t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: midnight + 1000 });
	const calls: string[] = [];
	const stop = startReminderScheduler(
		{
			generate: (date: string, slot: string) => {
				calls.push(date + slot);
				return { skipped: true };
			}
		} as unknown as SqliteReminders,
		'Europe/London'
	);
	assert.deepEqual(calls, []);
	t.mock.timers.tick(59000);
	assert.deepEqual(calls, []);
	for (let minute = 0; minute < 59; minute++) t.mock.timers.tick(60000);
	assert.deepEqual(calls, ['2026-10-1701:00']);
	stop();
});

test('Today uses timed overdue and active Note windows; other dates retain timed Notes', () => {
	const store = new SqliteReminders(':memory:', () => '2026-10-17');
	try {
		const task = store.create({ ...base, repeat: null, dueDate: '2026-10-17' });
		const note = store.create({
			...base,
			kind: 'note',
			repeat: null,
			dueDate: '2026-10-17',
			showFrom: '07:00',
			showUntil: '09:00'
		});
		assert.equal(isReminderOverdue(task, '2026-10-17', '07:59'), false);
		assert.equal(isReminderOverdue(task, '2026-10-17', '08:00'), true);
		assert.equal(noteVisibleNow(note, '06:59'), false);
		assert.equal(noteVisibleNow(note, '07:00'), true);
		assert.equal(noteVisibleNow(note, '09:00'), false);
		const sections = reminderWidgetSections(store.list(), '2026-10-17', '2026-10-17', '09:01');
		assert.equal(
			sections.flatMap((s) => s.items).some((r) => r.id === note.id),
			false
		);
		const past = reminderWidgetSections(store.list(), '2026-10-18', '2026-10-17', '12:00');
		assert.equal(
			past.flatMap((s) => s.items).some((r) => r.id === note.id),
			true
		);
	} finally {
		store.close();
	}
});

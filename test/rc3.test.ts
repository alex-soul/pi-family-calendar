import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { SqliteReminders } from '../src/lib/server/reminders.ts';
import { AdminAccess } from '../src/lib/server/admin.ts';
import { syncLight } from '../src/lib/sync-health.ts';

test('Past queries search the entire dataset before paging and delete only reviewed past Notes', () => {
	let today = '2026-10-28';
	const repo = new SqliteReminders(':memory:', () => today);
	try {
		for (let i = 0; i < 215; i++)
			repo.create({
				title: `Archived ${i}`,
				kind: 'note',
				list: 'General',
				dueDate: i === 0 ? '2026-10-27' : '2026-10-26'
			});
		const current = repo.create({ title: 'Today', kind: 'note', list: 'General', dueDate: today });
		const anytime = repo.create({ title: 'Anytime', kind: 'note', list: 'General', dueDate: null });
		const todo = repo.create({
			title: 'Old task',
			kind: 'todo',
			list: 'General',
			dueDate: '2026-10-20'
		});
		const template = repo.create({
			title: 'Template',
			kind: 'note',
			list: 'General',
			dueDate: '2026-10-20',
			repeat: { frequency: 'daily', interval: 1, until: null }
		});
		assert.equal(repo.managementPage('past', 'note').length, 200);
		assert.equal(repo.managementPage('past', 'note', '', '', 200).length, 15);
		assert.equal(repo.managementPage('past', 'note')[0].title, 'Archived 0');
		assert.equal(repo.managementPage('past', 'note', 'Archived 214').length, 1);
		assert.equal(repo.managementPage('past', 'note', '', 'missing-category').length, 0);
		const beforeMidnight = repo.pastSummary();
		today = '2026-10-29';
		assert.throws(() => repo.removePast(beforeMidnight.revision), /changed/);
		const beforeEdit = repo.pastSummary();
		repo.update(current.id, current.version, {
			title: 'Edited',
			kind: 'note',
			list: 'General',
			dueDate: '2026-10-28'
		});
		assert.throws(() => repo.removePast(beforeEdit.revision), /changed/);
		assert.equal(repo.removePast(repo.pastSummary().revision), 216);
		assert.deepEqual(
			new Set(repo.list().map((r) => r.id)),
			new Set([anytime.id, todo.id, template.id])
		);
	} finally {
		repo.close();
	}
});

test('six-digit setup preserves legacy PIN login and SSH disable permits new setup', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'calendar-rc3-pin-'));
	const path = join(directory, 'admin.sqlite');
	const access = new AdminAccess(path);
	try {
		await assert.rejects(access.configure(undefined, '1234567'), /exactly 6/);
		const db = new DatabaseSync(path);
		db.prepare('UPDATE access SET hash=?,salt=? WHERE id=1').run(
			scryptSync('01234567', 'fictional-salt', 64).toString('hex'),
			'fictional-salt'
		);
		db.close();
		const old = await access.login('01234567');
		assert.ok(access.authorized(old!));
		const result = spawnSync(process.execPath, ['scripts/reset-admin.mjs', '--confirm'], {
			env: { ...process.env, DATA_DIR: directory },
			encoding: 'utf8'
		});
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /\/admin\/access/);
		assert.equal(access.enabled(), false);
		await access.configure(undefined, '001234');
		assert.equal(access.authorized(old!), false);
		assert.ok(await access.login('001234'));
	} finally {
		access.close();
		rmSync(directory, { recursive: true, force: true });
	}
});

test('status tube cannot stay green when health refresh becomes stale', () => {
	assert.equal(syncLight('healthy', 1000, 2000).state, 'healthy');
	assert.equal(syncLight('healthy', 1000, 92000).state, 'error');
	assert.equal(syncLight('unknown', 0, 100000).state, 'unknown');
	assert.equal(syncLight('disabled', 1000, 2000).state, 'disabled');
	assert.equal(syncLight('error', 1000, 2000).state, 'error');
});

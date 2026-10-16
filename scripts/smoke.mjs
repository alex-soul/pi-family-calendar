import assert from 'node:assert/strict';
import { addDays, dateKey } from '../src/lib/dates.ts';
import { randomUUID } from 'node:crypto';

const origin = new URL(process.argv[2] || 'http://127.0.0.1:8775').origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
	throw new Error('Smoke tests must target a local development preview.');
}
const send = (path, method = 'GET', body, requestOrigin = origin) =>
	fetch(`${origin}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
		signal: AbortSignal.timeout(10_000)
	});

let created;
try {
	assert.equal((await send('/healthz')).status, 200);
	assert.equal((await send('/api/calendar?date=2026-02-30')).status, 400);
	assert.equal((await send('/api/calendar?date=9999-12-31')).status, 400);
	assert.equal((await send('/api/reminders', 'POST', { title: 'invalid' })).status, 400);
	assert.equal((await send('/api/reminders', 'POST', {}, 'https://unrelated.invalid')).status, 403);
	const response = await send('/api/reminders', 'POST', {
		title: `Smoke ${randomUUID()}`,
		list: 'General',
		dueDate: null
	});
	assert.equal(response.status, 201);
	created = await response.json();
	const staleVersion = created.version;
	let result = await send(`/api/reminders/${created.id}`, 'PATCH', {
		version: created.version,
		completed: true
	});
	assert.equal(result.status, 200);
	created = await result.json();
	assert.ok(created.completedAt);
	assert.equal(
		(
			await send(`/api/reminders/${created.id}`, 'PATCH', {
				version: staleVersion,
				completed: false
			})
		).status,
		409
	);
	result = await send(`/api/reminders/${created.id}`, 'PATCH', {
		version: created.version,
		completed: false
	});
	created = await result.json();
	assert.equal(created.completedAt, null);
	result = await send(`/api/reminders/${created.id}`, 'PATCH', {
		version: created.version,
		title: created.title,
		list: 'General',
		dueDate: '2026-10-17'
	});
	assert.equal(result.status, 200);
	created = await result.json();
	assert.equal(created.list, 'General');
	const rows = await (await send('/api/reminders')).json();
	assert.equal(rows.find((r) => r.id === created.id)?.version, created.version);
	assert.equal(
		(await send(`/api/reminders/${created.id}`, 'DELETE', { version: created.version })).status,
		204
	);
	assert.equal(
		(
			await send(`/api/reminders/${created.id}`, 'PATCH', {
				version: created.version,
				completed: true
			})
		).status,
		404
	);
	created = undefined;
	result = await send('/api/reminders', 'POST', {
		kind: 'note',
		title: `Smoke note ${randomUUID()}`,
		list: 'General',
		dueDate: null
	});
	assert.equal(result.status, 201);
	created = await result.json();
	assert.equal(created.kind, 'note');
	assert.equal(
		(
			await send(`/api/reminders/${created.id}`, 'PATCH', {
				version: created.version,
				completed: true
			})
		).status,
		400
	);
	result = await send(`/api/reminders/${created.id}`, 'PATCH', {
		version: created.version,
		title: created.title,
		list: created.list,
		dueDate: '2026-10-16'
	});
	assert.equal(result.status, 200);
	created = await result.json();
	assert.equal(created.kind, 'note');
	assert.equal(created.completedAt, null);
	assert.equal(
		(await send(`/api/reminders/${created.id}`, 'DELETE', { version: created.version })).status,
		204
	);
	created = undefined;

	const calendar = await (await send('/api/calendar')).json();
	const today = dateKey(new Date(), calendar.timeZone);
	for (const dueDate of [addDays(today, -1), today, addDays(today, 1)]) {
		created = await (
			await send('/api/reminders', 'POST', {
				title: `Date boundary ${randomUUID()}`,
				list: 'General',
				dueDate
			})
		).json();
		for (const [suffix, method] of [
			['/complete', 'POST'],
			['', 'PATCH']
		]) {
			const response = await send(`/api/reminders/${created.id}${suffix}`, method, {
				version: created.version,
				completed: true
			});
			assert.equal(response.status, dueDate === today ? 200 : 400);
			if (response.ok) created = await response.json();
		}
		const stored = (await (await send('/api/reminders')).json()).find((r) => r.id === created.id);
		assert.equal(!!stored.completedAt, dueDate === today);
		assert.equal(
			(await send(`/api/reminders/${created.id}`, 'DELETE', { version: stored.version })).status,
			204
		);
		created = undefined;
	}
	console.log('Completion date HTTP checks passed for today, past and future on both endpoints.');
	console.log(
		'Note HTTP smoke passed: create, completion rejection, legacy edit preservation and delete.'
	);
	console.log(
		'HTTP smoke passed: health, invalid input, origin rejection, CRUD, completion/undo and stale-write protection.'
	);
} finally {
	if (created) {
		const rows = await (await send('/api/reminders')).json();
		const row = rows.find((r) => r.id === created.id);
		if (row) await send(`/api/reminders/${row.id}`, 'DELETE', { version: row.version });
	}
}

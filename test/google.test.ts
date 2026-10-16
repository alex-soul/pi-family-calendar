import { test, beforeEach } from 'node:test';
beforeEach((context) =>
	context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T12:00:00Z') })
);
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Credentials } from 'google-auth-library';
import { GoogleStore } from '../src/lib/server/google-store.ts';
import { GoogleCalendars } from '../src/lib/server/google.ts';
import {
	collectPages,
	collectChanges,
	changeQuery,
	safeGoogleFailure,
	normalizeEvent,
	GoogleFailure,
	LiveGoogleGateway,
	GOOGLE_SCOPE,
	type GoogleGateway,
	type GoogleCalendar,
	type GoogleEvent,
	type GoogleConfig
} from '../src/lib/server/google-api.ts';
const config = {
	clientId: 'fictional.apps.googleusercontent.com',
	clientSecret: 'fixture-client-secret'
};
class FakeGoogle implements GoogleGateway {
	calls = 0;
	account = 'one';
	failure: GoogleFailure | undefined;
	list: GoogleCalendar[] = [
		{
			id: 'one',
			summary: 'Personal',
			primary: true,
			accessRole: 'owner',
			backgroundColor: '#abcdef'
		},
		{ id: 'shared', summary: 'Family', accessRole: 'reader' }
	];
	items: GoogleEvent[] = [
		{
			id: 'series_20261016',
			summary: 'Weekly club',
			start: { dateTime: '2026-10-16T10:00:00+01:00' },
			end: { dateTime: '2026-10-16T11:00:00+01:00' }
		},
		{ id: 'deleted', status: 'cancelled' }
	];
	changeCalls = 0;
	instanceCalls = 0;
	cursor = 0;
	history = new Map<string, Map<string, GoogleEvent>>();
	resetNext = false;
	async changes(
		_c: GoogleConfig,
		_t: Credentials,
		save: (t: Credentials) => void,
		_id: string,
		token?: string
	) {
		this.changeCalls++;
		if (this.failure) throw this.failure;
		if (this.resetNext && token) {
			this.resetNext = false;
			throw new GoogleFailure('reset', 'Cursor expired');
		}
		save({ access_token: 'fixture-renewed-secret' });
		const current = new Map(
			this.items.filter((i) => i.status !== 'cancelled').map((i) => [i.id!, i])
		);
		const prior = token ? this.history.get(token) : undefined;
		const items = prior
			? [...current.values()].filter((i) => JSON.stringify(i) !== JSON.stringify(prior.get(i.id!)))
			: [...current.values()];
		if (prior)
			for (const id of prior.keys()) if (!current.has(id)) items.push({ id, status: 'cancelled' });
		const syncToken = 'cursor-' + ++this.cursor;
		this.history.set(
			syncToken,
			new Map([...current].map(([id, item]) => [id, structuredClone(item)]))
		);
		return { items, syncToken };
	}
	async instances(
		_c: GoogleConfig,
		_t: Credentials,
		_save: (t: Credentials) => void,
		_id: string,
		series: string
	) {
		this.instanceCalls++;
		if (this.failure) throw this.failure;
		return this.items.filter((i) => i.recurringEventId === series && i.status !== 'cancelled');
	}

	authorize(_c: GoogleConfig, _r: string, state: string, _v: string) {
		return 'https://accounts.google.com/o/oauth2/v2/auth?state=' + state;
	}
	async exchange() {
		return {
			refresh_token: 'fixture-refresh-secret',
			access_token: 'fixture-access-secret',
			scope: GOOGLE_SCOPE
		};
	}
	async calendars() {
		if (this.failure) throw this.failure;
		return this.list;
	}
	async events(_c: GoogleConfig, _t: Credentials, save: (t: Credentials) => void) {
		this.calls++;
		save({ access_token: 'fixture-renewed-secret' });
		if (this.failure) throw this.failure;
		return this.items.filter((i) => !i.recurrence);
	}
}
function fixture() {
	const path = mkdtempSync(join(tmpdir(), 'family-google-'));
	const store = new GoogleStore(path),
		gateway = new FakeGoogle(),
		service = new GoogleCalendars(store, gateway);
	return {
		path,
		store,
		gateway,
		service,
		close() {
			service.close();
			rmSync(path, { recursive: true, force: true });
		}
	};
}
async function connect(service: GoogleCalendars) {
	const flow = service.begin('http://127.0.0.1:8775');
	const state = new URL(flow.url).searchParams.get('state');
	await service.finish(state, flow.binding, 'fixture-code');
	return { flow, state };
}
const range = ['2026-10-01', '2026-11-19', 'Europe/London'] as const;

test('OAuth request is read-only, offline, state-bound and uses PKCE', () => {
	const url = new URL(
		new LiveGoogleGateway().authorize(
			config,
			'http://127.0.0.1:8775/api/google/callback',
			'state',
			'verifier'
		)
	);
	assert.equal(url.origin, 'https://accounts.google.com');
	assert.equal(url.searchParams.get('scope'), GOOGLE_SCOPE);
	assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
	assert.equal(url.searchParams.get('access_type'), 'offline');
	assert.equal(url.searchParams.get('state'), 'state');
	assert.notEqual(url.searchParams.get('code_challenge'), 'verifier');
});
test('OAuth state rejects wrong browser binding, replay, cancellation and remote callback origins', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		assert.throws(() => f.service.begin('http://example.invalid'));
		const flow = f.service.begin('http://127.0.0.1:8775'),
			state = new URL(flow.url).searchParams.get('state');
		await assert.rejects(f.service.finish(state, 'wrong', 'code'));
		await assert.rejects(f.service.finish(state, flow.binding, 'code'));
		assert.equal(f.service.status().accounts.length, 0);
		const accepted = await connect(f.service);
		await assert.rejects(f.service.finish(accepted.state, accepted.flow.binding, 'code'));
		const cancelled = f.service.begin('http://127.0.0.1:8775');
		await assert.rejects(
			f.service.finish(new URL(cancelled.url).searchParams.get('state'), cancelled.binding, null)
		);
		assert.equal(f.service.status().accounts.length, 1);
	} finally {
		f.close();
	}
});
test('credentials survive restart encrypted and never appear in management status', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.snapshot(...range, true);
		const status = JSON.stringify(f.service.status());
		assert.ok(!status.includes('secret'));
		assert.ok(!status.includes('tokens'));
		for (const file of readdirSync(f.path).filter((n) => n.startsWith('google.sqlite'))) {
			const data = readFileSync(join(f.path, file));
			for (const secret of [
				'fixture-client-secret',
				'fixture-refresh-secret',
				'fixture-renewed-secret'
			])
				assert.equal(data.includes(Buffer.from(secret)), false);
		}
		f.service.close();
		const store = new GoogleStore(f.path),
			service = new GoogleCalendars(store, f.gateway);
		assert.equal(service.status().accounts.length, 1);
		assert.equal(
			store.get<{ tokens: Credentials }[]>('accounts')![0].tokens.refresh_token,
			'fixture-refresh-secret'
		);
		assert.equal((await service.snapshot(...range)).events.length, 2);
		service.close();
	} finally {
		rmSync(f.path, { recursive: true, force: true });
	}
});
test('central sync handles cancellations and temporary failure without false freshness', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const first = await f.service.snapshot(...range, true);
		assert.equal(first.events.length, 2);
		assert.equal(first.sync?.stale, false);
		const calls = f.gateway.calls;
		await f.service.snapshot(...range);
		assert.equal(f.gateway.calls, calls, 'fresh cache avoids repeated Google reads');
		f.gateway.failure = new GoogleFailure('temporary', 'Offline');
		const stale = await f.service.snapshot(...range, true);
		assert.equal(stale.events.length, 2);
		assert.equal(stale.fetchedAt, first.fetchedAt);
		assert.equal(stale.sync?.stale, true);
		assert.equal(
			(await f.service.snapshot('2030-01-01', '2030-02-19', 'Europe/London')).fetchedAt,
			''
		);
		f.gateway.failure = undefined;
		f.gateway.items = [];
		const removed = await f.service.snapshot(...range, true);
		assert.equal(removed.events.length, 0);
		assert.equal(removed.sync?.stale, false);
	} finally {
		f.close();
	}
});
test('selected calendars and shared calendars across accounts produce no duplicate events', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		f.gateway.list = [
			{ id: 'two', primary: true, accessRole: 'owner' },
			{ id: 'shared', accessRole: 'reader' }
		];
		await connect(f.service);
		assert.equal(f.service.status().accounts.length, 2);
		// Each account gets its own primary and the same shared calendar.
		f.gateway.calendars = async (_c?: GoogleConfig, tokens?: Credentials) =>
			tokens?.refresh_token === 'second'
				? f.gateway.list
				: [
						{ id: 'one', primary: true, accessRole: 'owner' },
						{ id: 'shared', accessRole: 'reader' }
					];
		const accounts = f.store.get<{ tokens: Credentials }[]>('accounts')!;
		accounts[1].tokens.refresh_token = 'second';
		f.store.set('accounts', accounts);
		const result = await f.service.snapshot(...range, true);
		assert.equal(result.calendars.length, 3);
		assert.equal(result.events.length, 3);
		const id = f.service.status().accounts[0].id;
		f.service.select(id, []);
		assert.equal((await f.service.snapshot(...range, true)).calendars.length, 2);
		assert.throws(() => f.service.select(id, ['not-available']));
		f.service.disconnect(id);
		assert.equal(f.service.status().accounts.length, 1);
	} finally {
		f.close();
	}
});
test('confirmed permission loss removes cached events; missing calendars are removed from selection', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.snapshot(...range, true);
		f.gateway.failure = new GoogleFailure('authorization', 'Reconnect');
		const revoked = await f.service.snapshot(...range, true);
		assert.equal(revoked.events.length, 0);
		assert.equal(revoked.fetchedAt, '');
		assert.equal(revoked.sync?.stale, true);
		f.gateway.failure = undefined;
		f.gateway.list = [f.gateway.list[0]];
		const reduced = await f.service.snapshot(...range, true);
		assert.equal(reduced.calendars.length, 1);
		assert.equal(f.service.status().accounts[0].calendars.length, 1);
	} finally {
		f.close();
	}
});
test('Google normalization preserves exclusive all-day dates, offsets and distinct recurring instance IDs', () => {
	const a = normalizeEvent(
		{ id: 'a', start: { date: '2026-10-24' }, end: { date: '2026-10-27' } },
		'c'
	);
	assert.equal(a?.kind, 'all-day');
	if (a?.kind === 'all-day') assert.equal(a.endDate, '2026-10-27');
	const timed = normalizeEvent(
		{
			id: 'occurrence1',
			start: { dateTime: '2026-10-25T01:30:00+01:00' },
			end: { dateTime: '2026-10-25T01:30:00+00:00' }
		},
		'c'
	);
	assert.equal(timed?.kind, 'timed');
	assert.notEqual(
		timed?.id,
		normalizeEvent(
			{ id: 'occurrence2', start: { date: '2026-10-24' }, end: { date: '2026-10-25' } },
			'c'
		)?.id
	);
	assert.equal(normalizeEvent({ id: 'cancelled', status: 'cancelled' }, 'c'), null);
	assert.throws(() =>
		normalizeEvent(
			{ id: 'bad', start: { dateTime: 'not-a-date' }, end: { dateTime: 'not-a-date' } },
			'c'
		)
	);
});

test('all pages are collected and failed or looping pages cannot replace a complete cache', async () => {
	const tokens: (string | undefined)[] = [];
	const all = await collectPages<number>(async (token) => {
		tokens.push(token);
		return token ? { items: [2] } : { items: [1], nextPageToken: 'next' };
	});
	assert.deepEqual(all, [1, 2]);
	assert.deepEqual(tokens, [undefined, 'next']);
	await assert.rejects(collectPages(async () => ({ items: [], nextPageToken: 'loop' })));
	await assert.rejects(
		collectPages(async (token) => {
			if (token) throw new Error('offline');
			return { items: [1], nextPageToken: 'second' };
		})
	);
});
test('quota failures retain cache and errors never include provider tokens or raw error details', () => {
	assert.equal(
		safeGoogleFailure({
			response: { status: 403, data: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } }
		}).kind,
		'temporary'
	);
	assert.equal(
		safeGoogleFailure({
			response: { status: 403, data: { error: { errors: [{ reason: 'forbidden' }] } } }
		}).kind,
		'permission'
	);
	assert.equal(
		safeGoogleFailure({ response: { status: 400, data: { error: 'invalid_grant' } } }).kind,
		'authorization'
	);
	assert.ok(!safeGoogleFailure(new Error('secret-token')).message.includes('secret-token'));
});

test('calendar appearance survives cache, offline reads, provider refresh, reconnect and restart without changing source metadata', async () => {
	const f = fixture();
	let closed = false;
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const first = await f.service.snapshot(...range, true);
		const id = first.calendars[0].id;
		f.service.saveAppearance(id, '  Our home  ', '#AABBCC');
		const calls = f.gateway.calls;
		const cached = await f.service.snapshot(...range);
		assert.equal(f.gateway.calls, calls);
		assert.equal(cached.calendars[0].name, 'Our home');
		assert.equal(cached.calendars[0].color, '#aabbcc');
		assert.deepEqual(cached.events, JSON.parse(JSON.stringify(first.events)));
		assert.equal(cached.fetchedAt, first.fetchedAt);
		assert.equal(f.service.status().accounts[0].calendars[0].sourceName, 'Personal');
		f.gateway.failure = new GoogleFailure('temporary', 'Offline');
		assert.equal((await f.service.snapshot(...range, true)).calendars[0].name, 'Our home');
		f.gateway.failure = undefined;
		f.gateway.list[0].summary = 'New Google name';
		f.gateway.list[0].backgroundColor = '#123456';
		await f.service.snapshot(...range, true);
		await connect(f.service);
		assert.equal(f.service.status().accounts[0].calendars[0].name, 'Our home');
		assert.equal(f.service.status().accounts[0].calendars[0].sourceName, 'New Google name');
		f.service.close();
		closed = true;
		const restarted = new GoogleCalendars(new GoogleStore(f.path), f.gateway);
		try {
			assert.equal((await restarted.snapshot(...range)).calendars[0].color, '#aabbcc');
			restarted.saveAppearance(id, '', null);
			const reset = await restarted.snapshot(...range);
			assert.equal(reset.calendars[0].name, 'New Google name');
			assert.equal(reset.calendars[0].color, '#123456');
		} finally {
			restarted.close();
		}
	} finally {
		if (!closed) f.service.close();
		rmSync(f.path, { recursive: true, force: true });
	}
});

test('calendar appearance validates enabled IDs, names and colours; shared copies use one override', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const calendar = f.service.status().accounts[0].calendars[1];
		for (const args of [
			[calendar.id, 'x'.repeat(81), null],
			[calendar.id, 'Bad\nname', null],
			[calendar.id, 42, null],
			[calendar.id, 'Home', 'red'],
			[calendar.id, 'Home', '#fff'],
			[calendar.id, 'Home', undefined],
			['unknown', 'Home', '#123456']
		]) {
			assert.throws(() => f.service.saveAppearance(...(args as [unknown, unknown, unknown])));
		}
		f.service.saveAppearance(calendar.id, 'Shared household', '#123456');
		f.gateway.list = [
			{ id: 'two', primary: true, accessRole: 'owner' },
			{ id: 'shared', summary: 'Other account label', accessRole: 'reader' }
		];
		await connect(f.service);
		assert.equal(
			f.service
				.status()
				.accounts.flatMap((a) => a.calendars)
				.filter((c) => c.name === 'Shared household').length,
			2
		);
		const accounts = f.service.status().accounts;
		for (const account of accounts) f.service.select(account.id, []);
		assert.throws(() => f.service.saveAppearance(calendar.id, 'Disabled', '#123456'));
		f.service.select(accounts[0].id, ['shared']);
		assert.equal(f.service.status().accounts[0].calendars[1].name, 'Shared household');
	} finally {
		f.close();
	}
});

test('covered local queries and overlapping views never contact Google, even after restart', async () => {
	const f = fixture();
	let closed = false;
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const before = f.gateway.changeCalls + f.gateway.calls;
		for (const r of [
			range,
			['2026-10-15', '2026-12-31', 'Europe/London'],
			['2027-01-01', '2027-05-01', 'Europe/London']
		] as const)
			await f.service.snapshot(...r);
		assert.equal(f.gateway.changeCalls + f.gateway.calls, before);
		f.service.close();
		closed = true;
		const restarted = new GoogleCalendars(new GoogleStore(f.path), f.gateway);
		try {
			assert.equal((await restarted.snapshot(...range)).events.length, 2);
			assert.equal(f.gateway.changeCalls + f.gateway.calls, before);
		} finally {
			restarted.close();
		}
	} finally {
		if (!closed) f.service.close();
		rmSync(f.path, { recursive: true, force: true });
	}
});
test('incremental no-change checks avoid range downloads; changes and deleted instances update atomically', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const calls = f.gateway.calls;
		await f.service.syncNow('Europe/London');
		assert.equal(f.gateway.calls, calls);
		f.gateway.items = [
			{ id: 'oneoff', summary: 'Moved', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }
		];
		await f.service.syncNow('Europe/London');
		assert.ok((await f.service.snapshot(...range)).events.every((e) => e.title === 'Moved'));
		assert.equal(f.gateway.calls, calls, 'one-off updates require no expanded range fetch');
		f.gateway.items = [];
		await f.service.syncNow('Europe/London');
		assert.equal((await f.service.snapshot(...range)).events.length, 0);
	} finally {
		f.close();
	}
});
test('invalid cursor rebuilds retained coverage, and failed replacement retains both data and cursor', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const cursor = f.store.get<string>('cursor:one');
		const events = (await f.service.snapshot(...range)).events;
		f.gateway.resetNext = true;
		const original = f.gateway.events.bind(f.gateway);
		f.gateway.events = async () => {
			throw new GoogleFailure('temporary', 'Offline during rebuild');
		};
		await f.service.syncNow('Europe/London');
		assert.equal(f.store.get('cursor:one'), cursor);
		assert.deepEqual((await f.service.snapshot(...range)).events, events);
		f.gateway.events = original;
		f.gateway.resetNext = true;
		await f.service.syncNow('Europe/London');
		assert.notEqual(f.store.get('cursor:one'), cursor);
		assert.equal((await f.service.snapshot(...range)).sync?.stale, false);
	} finally {
		f.close();
	}
});
test('incremental query excludes incompatible filters and cursor only comes from the final page', async () => {
	const query = changeQuery('saved', 'page2');
	assert.equal(query.singleEvents, 'false');
	assert.equal(query.showDeleted, 'true');
	for (const key of ['timeMin', 'timeMax', 'orderBy', 'updatedMin'])
		assert.equal(key in query, false);
	assert.deepEqual(
		await collectChanges(async (token) =>
			token
				? { items: [], nextSyncToken: 'new' }
				: { items: [{ id: 'removed', status: 'cancelled' }], nextPageToken: 'next' }
		),
		{ items: [{ id: 'removed', status: 'cancelled' }], syncToken: 'new' }
	);
	await assert.rejects(collectChanges(async () => ({ items: [] })));
	await assert.rejects(
		collectChanges(async (token) => {
			if (token) throw Error('offline');
			return { items: [], nextPageToken: 'next' };
		})
	);
});
test('past one-off events persist indefinitely and historical recurrence batches extend retained coverage', async () => {
	const f = fixture();
	try {
		f.gateway.items = [
			{ id: 'old', start: { date: '2010-01-01' }, end: { date: '2010-01-02' } },
			{
				id: 'weekly',
				recurrence: ['RRULE:FREQ=WEEKLY'],
				start: { date: '2025-01-01' },
				end: { date: '2025-01-02' }
			}
		];
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		assert.ok(
			f.store.mirror
				.read('one', { from: '2010-01-01', to: '2010-02-01' })
				.some((e) => e.id.includes('old'))
		);
		const first = f.store.mirror.state('one').ranges[0].from;
		await f.service.backfill('Europe/London');
		assert.ok(f.store.mirror.state('one').ranges[0].from < first);
		await f.service.syncNow('Europe/London');
		assert.ok(f.store.mirror.read('one', { from: '2010-01-01', to: '2010-02-01' }).length);
	} finally {
		f.close();
	}
});

test('recurrence exceptions, master changes and series deletion replace retained instances', async () => {
	const f = fixture();
	try {
		const master: GoogleEvent = {
			id: 'weekly',
			summary: 'Club',
			recurrence: ['RRULE:FREQ=WEEKLY'],
			start: { date: '2026-10-16' },
			end: { date: '2026-10-17' }
		};
		const occurrence: GoogleEvent = {
			id: 'weekly_16',
			recurringEventId: 'weekly',
			summary: 'Club',
			start: { date: '2026-10-16' },
			end: { date: '2026-10-17' }
		};
		f.gateway.items = [master, occurrence];
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		f.gateway.items = [
			master,
			{
				...occurrence,
				summary: 'Moved club',
				start: { date: '2026-10-18' },
				end: { date: '2026-10-19' }
			}
		];
		await f.service.syncNow('Europe/London');
		assert.ok((await f.service.snapshot(...range)).events.every((e) => e.title === 'Moved club'));
		assert.equal(f.gateway.instanceCalls, 2);
		f.gateway.items = [master];
		await f.service.syncNow('Europe/London');
		assert.equal((await f.service.snapshot(...range)).events.length, 0);
		f.gateway.items = [{ ...master, recurrence: undefined, summary: 'Single club' }];
		await f.service.syncNow('Europe/London');
		assert.equal((await f.service.snapshot(...range)).events.length, 2);
		f.gateway.items = [];
		await f.service.syncNow('Europe/London');
		assert.equal((await f.service.snapshot(...range)).events.length, 0);
	} finally {
		f.close();
	}
});
test('future extension is retained and concurrent readers share the same download', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const before = f.gateway.calls;
		await Promise.all(
			Array.from({ length: 5 }, () =>
				f.service.snapshot('2030-01-01', '2030-03-01', 'Europe/London')
			)
		);
		assert.equal(f.gateway.calls, before + 2);
		await f.service.snapshot('2030-02-01', '2030-03-01', 'Europe/London');
		assert.equal(f.gateway.calls, before + 2);
	} finally {
		f.close();
	}
});
test('automatic checks respect backoff and manual requests coalesce', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await Promise.all([f.service.syncNow('Europe/London'), f.service.syncNow('Europe/London')]);
		assert.equal(f.gateway.changeCalls, 2);
		f.gateway.failure = new GoogleFailure('temporary', 'Offline');
		await f.service.syncNow('Europe/London');
		const calls = f.gateway.changeCalls;
		const state = f.store.mirror.state('one');
		assert.ok(state.nextAttempt > Date.now());
		assert.ok(state.failures > 0);
		await f.service.syncNow('Europe/London', false);
		assert.equal(f.gateway.changeCalls, calls);
		assert.throws(() => f.service.setIntervalSeconds(1));
		f.service.setIntervalSeconds(300);
		assert.equal(f.service.systemStatus().intervalSeconds, 300);
	} finally {
		f.close();
	}
});
test('worker synchronizes without any browser snapshot request', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		f.service.start('Europe/London');
		const deadline = performance.now() + 3000;
		while (!f.store.mirror.state('one').lastSuccess && performance.now() < deadline)
			await new Promise((r) => setTimeout(r, 20));
		assert.ok(f.store.mirror.state('one').lastSuccess);
		assert.ok(f.gateway.changeCalls);
		// Let the startup job finish before closing its database.
		while (f.service.systemStatus().running) await new Promise((r) => setTimeout(r, 10));
	} finally {
		f.close();
	}
});
test('legacy snapshot migration preserves events, credentials and coverage', async () => {
	const f = fixture();
	let closed = false;
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const snap = await f.service.snapshot(...range, true);
		f.store.cache('legacy', snap);
		f.store.remove('mirror-format');
		for (const id of f.store.mirror.ids()) f.store.mirror.remove(id);
		f.service.close();
		closed = true;
		const store = new GoogleStore(f.path);
		try {
			assert.ok(store.get('config'));
			assert.equal(store.mirror.read('one', { from: range[0], to: range[1] }).length, 1);
			assert.deepEqual(store.mirror.state('one').ranges, [{ from: range[0], to: range[1] }]);
			assert.equal(store.get('mirror-format'), 1);
		} finally {
			store.close();
		}
	} finally {
		if (!closed) f.service.close();
		rmSync(f.path, { recursive: true, force: true });
	}
});

test('range replacement preserves events ending exactly at the exclusive Google boundary', () => {
	const f = fixture();
	try {
		f.store.mirror.put('one', [
			{ id: 'all-day-before', start: { date: '2026-08-30' }, end: { date: '2026-08-31' } },
			{
				id: 'timed-before',
				start: { dateTime: '2026-08-30T23:00:00Z' },
				end: { dateTime: '2026-08-31T00:00:00Z' }
			},
			{ id: 'inside', start: { date: '2026-09-01' }, end: { date: '2026-09-02' } }
		]);
		f.store.mirror.replaceRange('one', { from: '2026-09-01', to: '2026-10-01' }, []);
		const rows = f.store.mirror.read('one', { from: '2026-08-01', to: '2026-10-01' });
		assert.equal(rows.length, 2);
		assert.ok(rows.every((e) => e.id.includes('before')));
	} finally {
		f.close();
	}
});

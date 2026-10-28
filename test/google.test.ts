import { test, beforeEach } from 'node:test';
beforeEach((context) =>
	context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-16T12:00:00Z') })
);
import assert from 'node:assert/strict';
import { googleEventLink } from '../src/lib/google-event-link.ts';
import { requiresAdmin } from '../src/lib/server/admin.ts';
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
	linkCalls = 0;
	async eventLink(
		_c: GoogleConfig,
		_t: Credentials,
		_save: (t: Credentials) => void,
		_calendar: string,
		id: string
	) {
		this.linkCalls++;
		if (this.failure) throw this.failure;
		return 'https://calendar.google.com/calendar/event?eid=' + encodeURIComponent(id);
	}
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

test('public sync health distinguishes disabled, initial import, failures and recovery without account details', async () => {
	const f = fixture();
	try {
		assert.deepEqual(f.service.publicHealth(), { status: 'disabled' });
		f.service.saveConfig(config);
		await connect(f.service);
		assert.deepEqual(f.service.publicHealth(), { status: 'unknown' });
		await f.service.snapshot(...range, true);
		assert.deepEqual(f.service.publicHealth(), { status: 'healthy' });
		const state = f.store.mirror.state('one');
		state.error = 'Fixture failure';
		f.store.mirror.saveState('one', state);
		assert.deepEqual(f.service.publicHealth(), { status: 'error' });
		state.error = '';
		state.lastSuccess = new Date().toISOString();
		f.store.mirror.saveState('one', state);
		assert.deepEqual(f.service.publicHealth(), { status: 'healthy' });
		state.lastSuccess = '2026-10-15T00:00:00Z';
		f.store.mirror.saveState('one', state);
		assert.deepEqual(f.service.publicHealth(), { status: 'error' });
	} finally {
		f.close();
	}
});
const range = ['2026-10-01', '2026-11-19', 'Europe/London'] as const;

test('offline instances serve retained cache without calling any provider path', async () => {
	const f = fixture();
	f.service.saveConfig(config);
	await connect(f.service);
	const expected = await f.service.snapshot(...range, true);
	f.service.close();
	let calls = 0;
	const forbidden = new Proxy({} as GoogleGateway, {
		get() {
			return () => {
				calls++;
				throw new Error('Provider must not be called');
			};
		}
	});
	const offline = new GoogleCalendars(new GoogleStore(f.path), forbidden, true);
	try {
		offline.start('Europe/London');
		assert.deepEqual((await offline.snapshot(...range, true)).events, expected.events);
		await offline.snapshot('2020-01-01', '2020-02-01', 'Europe/London', true);
		await offline.backfill('Europe/London');
		await assert.rejects(offline.eventLink(JSON.stringify(['one', 'fixture'])));
		assert.throws(() => offline.begin('http://127.0.0.1:18775'), /paused/);
		await assert.rejects(offline.finish(null, undefined, null), /paused/);
		assert.equal(calls, 0);
		assert.equal(offline.systemStatus().offline, true);
	} finally {
		await offline.shutdown();
		rmSync(f.path, { recursive: true, force: true });
	}
});

test('shutdown stops queued sync and waits for the active provider request before closing storage', async () => {
	const f = fixture();
	f.service.saveConfig(config);
	await connect(f.service);
	let release!: () => void;
	const original = f.gateway.calendars.bind(f.gateway);
	f.gateway.calendars = async () => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		return original();
	};
	const work = f.service.syncNow('Europe/London');
	let closed = false;
	const shutdown = f.service.shutdown().then(() => {
		closed = true;
	});
	await Promise.resolve();
	assert.equal(closed, false);
	release();
	await work;
	await shutdown;
	assert.equal(closed, true);
	const reopened = new GoogleStore(f.path);
	assert.ok(reopened.get('accounts'));
	reopened.close();
	rmSync(f.path, { recursive: true, force: true });
});

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

test('event handoff validates destinations and retains the exact Google occurrence link', () => {
	const link = 'https://www.google.com/calendar/event?eid=fictional_occurrence';
	assert.equal(googleEventLink(link), link);
	for (const value of [
		'http://calendar.google.com/calendar/event?eid=x',
		'https://calendar.google.com.evil.test/calendar/event?eid=x',
		'https://www.google.com/url?q=https://evil.test',
		'javascript:alert(1)',
		'https://user:pass@calendar.google.com/calendar/event?eid=x',
		'https://calendar.google.com:444/calendar/event?eid=x'
	])
		assert.equal(googleEventLink(value), undefined);
	const event = normalizeEvent(
		{
			id: 'occurrence',
			recurringEventId: 'series',
			htmlLink: link,
			start: { date: '2026-10-18' },
			end: { date: '2026-10-19' }
		},
		'shared'
	);
	assert.equal(event?.googleUrl, link);
	assert.equal(requiresAdmin('/api/calendar/event-qr', 'POST'), false);
	assert.equal(requiresAdmin('/api/google', 'POST'), true);
});

test('event handoff uses stored links; legacy occurrence lookup is serialized, cached and survives restart', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const snapshot = await f.service.snapshot(...range, true);
		const event = snapshot.events[0];
		const results = await Promise.all([
			f.service.eventLink(event.id),
			f.service.eventLink(event.id)
		]);
		assert.equal(results[0], results[1]);
		assert.equal(f.gateway.linkCalls, 1);
		f.gateway.failure = new GoogleFailure('temporary', 'Offline');
		assert.equal(await f.service.eventLink(event.id), results[0]);
		const secondStore = new GoogleStore(f.path);
		const second = new GoogleCalendars(secondStore, f.gateway);
		try {
			assert.equal(await second.eventLink(event.id), results[0]);
		} finally {
			second.close();
		}
		assert.equal(f.gateway.linkCalls, 1);
		await assert.rejects(f.service.eventLink('not-json'));
		await assert.rejects(f.service.eventLink(JSON.stringify(['one', 'unknown'])));
		assert.equal(f.gateway.linkCalls, 1, 'unknown IDs cannot cause Google requests');
		f.gateway.failure = undefined;
		f.service.disconnect(f.service.status().accounts[0].id);
		await assert.rejects(f.service.eventLink(event.id));
	} finally {
		f.close();
	}
});

test('event handoff reads original API links locally without fetching Google or substituting a series master', async () => {
	const f = fixture();
	try {
		f.gateway.items[0].htmlLink = 'https://www.google.com/calendar/event?eid=original';
		f.service.saveConfig(config);
		await connect(f.service);
		const snapshot = await f.service.snapshot(...range, true);
		assert.equal(await f.service.eventLink(snapshot.events[0].id), f.gateway.items[0].htmlLink);
		assert.equal(f.gateway.linkCalls, 0);
		f.gateway.items = [];
		await f.service.syncNow('Europe/London');
		await assert.rejects(f.service.eventLink(snapshot.events[0].id));
	} finally {
		f.close();
	}
});

test('new-event QR requires an editable default, preserves date across DST and persists without Google writes', async () => {
	const f = fixture();
	try {
		assert.equal(f.service.eventQrSettings().enabled, false);
		assert.throws(() => f.service.newEventLink('2026-10-25', 'Europe/London'));
		f.service.saveConfig(config);
		await connect(f.service);
		assert.throws(() => f.service.configureEventQr(true, 'shared'), /editable/);
		assert.throws(() => f.service.configureEventQr(true, 'unknown'), /editable/);
		f.service.configureEventQr(true, 'one');
		const before = f.gateway.calls + f.gateway.changeCalls;
		const url = new URL(f.service.newEventLink('2026-10-25', 'Europe/London'));
		assert.equal(url.origin, 'https://calendar.google.com');
		assert.equal(url.pathname, '/calendar/render');
		assert.equal(url.searchParams.get('dates'), '20261025T120000/20261025T120000');
		assert.equal(url.searchParams.get('src'), 'one');
		assert.equal(url.searchParams.get('ctz'), 'Europe/London');
		assert.equal(url.searchParams.get('stz'), 'Europe/London');
		assert.equal(url.searchParams.get('etz'), 'Europe/London');
		assert.equal(
			new URL(f.service.newEventLink('2026-07-15', 'Europe/London')).searchParams.get('dates'),
			'20260715T120000/20260715T120000'
		);
		assert.equal(url.searchParams.get('action'), 'TEMPLATE');
		assert.equal(url.searchParams.has('authuser'), false);
		assert.equal(
			new URL(f.service.newEventLink('2026-10-25', 'Europe/London', true)).searchParams.get(
				'dates'
			),
			'20261025/20261026'
		);
		assert.equal(
			new URL(
				f.service.newEventLink('2026-10-30', 'Europe/London', true, '2026-11-02')
			).searchParams.get('dates'),
			'20261030/20261103'
		);
		assert.throws(() => f.service.newEventLink('2026-10-25', 'UTC', true, '2026-10-24'));
		assert.throws(() => f.service.newEventLink('2026-10-25', 'UTC', true, '2026-11-31'));
		assert.throws(() => f.service.newEventLink('2026-10-25', 'UTC', false, '2026-10-26'));
		assert.throws(() => f.service.newEventLink('2026-10-25', 'UTC', 'true'));
		assert.equal(f.gateway.calls + f.gateway.changeCalls, before);
		assert.equal(
			new URL(f.service.newEventLink('2026-12-31', 'Europe/London')).searchParams.get('dates'),
			'20261231T120000/20261231T120000'
		);
		for (const date of ['2026-02-30', '1899-12-31', '2100-01-01', 'bad'])
			assert.throws(() => f.service.newEventLink(date, 'UTC'));
		const second = new GoogleCalendars(new GoogleStore(f.path), f.gateway);
		try {
			assert.equal(second.eventQrSettings().available, true);
		} finally {
			second.close();
		}
		f.service.disconnect(f.service.status().accounts[0].id);
		assert.equal(f.service.eventQrSettings().available, false);
		assert.throws(() => f.service.newEventLink('2026-10-25', 'UTC'));
		f.service.configureEventQr(false, 'one');
		assert.equal(
			f.service.eventQrSettings().enabled,
			false,
			'Unavailable default can still be switched off'
		);
		assert.equal(requiresAdmin('/api/admin/event-qr', 'POST'), true);
	} finally {
		f.close();
	}
});

test('safe errors distinguish timeout, connection, quota and local failures without leaking details', () => {
	assert.match(
		safeGoogleFailure({ cause: { name: 'AbortError', message: 'secret aborted' } }).message,
		/timed out/
	);
	assert.match(safeGoogleFailure({ cause: { code: 'ECONNRESET' } }).message, /Connection/);
	assert.match(safeGoogleFailure({ response: { status: 429 } }).message, /request limit/);
	assert.equal(safeGoogleFailure(new Error('private SQL details'), 'local').kind, 'local');
	assert.doesNotMatch(
		safeGoogleFailure(new Error('private SQL details'), 'local').message,
		/private SQL/
	);
	assert.doesNotMatch(safeGoogleFailure(new Error('unknown')).message, /limit/);
});

test('multi-year rebuild is bounded and a late failed batch preserves the old cursor and cache', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const state = f.store.mirror.state('one');
		state.ranges = [{ from: '2020-01-01', to: '2028-02-14' }];
		f.store.mirror.saveState('one', state);
		const cursor = f.store.get('cursor:one');
		const events = (await f.service.snapshot(...range)).events;
		const windows: { from: string; to: string }[] = [];
		let fail = true;
		f.gateway.resetNext = true;
		const gateway = f.gateway as GoogleGateway;
		gateway.events = async (_c, _t, _save, _id, from, to) => {
			windows.push({ from, to });
			const progress = f.service.systemStatus().calendars.find((c) => c.id === 'one')!.progress!;
			assert.equal(progress.phase, 'Rebuilding calendar');
			assert.equal(progress.completed, windows.length - 1);
			assert.equal(progress.total, 9);
			assert.ok(Date.parse(to) - Date.parse(from) <= 366 * 86400000);
			if (fail && windows.length === 3) throw new GoogleFailure('temporary', 'Fixture timeout');
			return f.gateway.items;
		};
		await f.service.retrySync('Europe/London', 'one');
		assert.equal(windows.length, 3);
		assert.equal(f.store.get('cursor:one'), cursor);
		assert.deepEqual((await f.service.snapshot(...range)).events, events);
		assert.equal(f.service.systemStatus().calendars.find((c) => c.id === 'one')!.progress, null);
		fail = false;
		windows.length = 0;
		f.gateway.resetNext = true;
		await f.service.retrySync('Europe/London', 'one');
		assert.equal(windows.length, 9);
		assert.equal(windows[0].from, '2020-01-01');
		assert.equal(windows.at(-1)!.to, '2028-02-14');
		for (let i = 1; i < windows.length; i++) assert.equal(windows[i].from, windows[i - 1].to);
		assert.notEqual(f.store.get('cursor:one'), cursor);
		assert.equal(f.store.mirror.state('one').error, '');
	} finally {
		f.close();
	}
});

test('targeted retry bypasses backoff without touching other selected calendars', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const account = f.service.status().accounts[0];
		f.service.select(account.id, ['one', 'shared']);
		await f.service.syncNow('Europe/London');
		const otherCursor = f.store.get('cursor:shared');
		const state = f.store.mirror.state('one');
		state.nextAttempt = Date.now() + 3600000;
		state.error = 'Fixture failure';
		f.store.mirror.saveState('one', state);
		const calls = f.gateway.changeCalls;
		await f.service.retrySync('Europe/London', 'one');
		assert.equal(f.gateway.changeCalls, calls + 1);
		assert.equal(f.store.get('cursor:shared'), otherCursor);
		assert.equal(f.store.mirror.state('one').error, '');
		await assert.rejects(f.service.retrySync('Europe/London', 'not-selected'), /enabled calendar/);
	} finally {
		f.close();
	}
});

test('manual retry waits for a background pass then retries a backed-off calendar', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		await f.service.syncNow('Europe/London');
		const state = f.store.mirror.state('one');
		state.nextAttempt = Date.now() + 3600000;
		state.error = 'Fixture network error';
		f.store.mirror.saveState('one', state);
		// A background pass already owns the service, waiting on another provider read.
		let release!: () => void;
		let entered!: () => void;
		const started = new Promise<void>((r) => (entered = r));
		const original = f.gateway.changes.bind(f.gateway);
		f.gateway.changes = async (...args: Parameters<typeof original>) => {
			entered();
			await new Promise<void>((r) => (release = r));
			return original(...args);
		};
		const other = f.store.mirror.state('shared');
		other.nextAttempt = 0;
		f.store.mirror.saveState('shared', other);
		const active = f.service.syncNow('Europe/London', false);
		await started;
		const retry = f.service.retrySync('Europe/London', 'one');
		f.gateway.changes = original;
		release();
		const before = f.gateway.changeCalls;
		await Promise.all([active, retry]);
		assert.equal(f.gateway.changeCalls, before + 2);
		assert.equal(f.store.mirror.state('one').error, '');
	} finally {
		f.close();
	}
});

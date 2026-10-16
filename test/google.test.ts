import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Credentials } from 'google-auth-library';
import { GoogleStore } from '../src/lib/server/google-store.ts';
import { GoogleCalendars } from '../src/lib/server/google.ts';
import {
	collectPages,
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
		return this.items;
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
		await f.service.snapshot(...range);
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
test('full window sync handles cancellations, deletion, recurrence instances, and temporary failure without false freshness', async () => {
	const f = fixture();
	try {
		f.service.saveConfig(config);
		await connect(f.service);
		const first = await f.service.snapshot(...range);
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
			(await f.service.snapshot('2027-01-01', '2027-02-19', 'Europe/London', true)).fetchedAt,
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
		await f.service.snapshot(...range);
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
		const first = await f.service.snapshot(...range);
		const id = first.calendars[0].id;
		f.service.saveAppearance(id, '  Our home  ', '#AABBCC');
		const calls = f.gateway.calls;
		const cached = await f.service.snapshot(...range);
		assert.equal(f.gateway.calls, calls);
		assert.equal(cached.calendars[0].name, 'Our home');
		assert.equal(cached.calendars[0].color, '#aabbcc');
		assert.deepEqual(cached.events, JSON.parse(JSON.stringify(first.events)));
		assert.equal(cached.fetchedAt, first.fetchedAt);
		assert.equal(f.store.cached(JSON.stringify(range))!.calendars[0].name, 'Personal');
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

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { googleEventLink } from '../google-event-link.ts';
import type { Credentials } from 'google-auth-library';
import type { CalendarSnapshot, Calendar } from '../domain.ts';
import { addDays, dateKey, isDateKey } from '../dates.ts';
import { mergeRanges, missingRanges, standardRange, type Range } from './calendar-mirror.ts';
import { GoogleStore } from './google-store.ts';
import {
	LiveGoogleGateway,
	GoogleFailure,
	safeGoogleFailure,
	normalizeCalendar,
	type GoogleGateway,
	type GoogleConfig,
	type GoogleCalendar,
	type GoogleEvent
} from './google-api.ts';

interface Account {
	id: string;
	label: string;
	tokens: Credentials;
	calendars: GoogleCalendar[];
	selected: string[];
	error?: string;
	unavailable?: boolean;
}
interface Pending {
	binding: string;
	verifier: string;
	redirect: string;
	expires: number;
	clientId: string;
}
interface CalendarAppearance {
	id: string;
	name: string;
	color: string | null;
}
export class SetupError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}
export class GoogleCalendars {
	private pending = new Map<string, Pending>();
	private inFlight: Promise<void> | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;
	private workerZone = 'UTC';
	private activity = '';
	private lastMetadata = 0;
	private extensionAttempts = new Map<string, number>();
	private oauthBusy = false;
	private store: GoogleStore;
	private gateway: GoogleGateway;
	constructor(store: GoogleStore, gateway?: GoogleGateway) {
		this.store = store;
		this.gateway = gateway || new LiveGoogleGateway(() => store.mirror.request());
	}
	configured() {
		return !!this.store.get<GoogleConfig>('config');
	}
	eventQrSettings() {
		const saved = this.store.get<{ enabled: boolean; calendarId: string }>('event-qr') || {
			enabled: false,
			calendarId: ''
		};
		const appearances = this.appearances();
		const calendars = [...this.selected()]
			.filter(([, value]) =>
				['owner', 'writer', 'writerWithoutPrivateAccess'].includes(value.calendar.accessRole || '')
			)
			.map(([id, value]) => ({
				id,
				name: this.presentCalendar(normalizeCalendar(value.calendar), appearances).name
			}));
		return {
			...saved,
			available: saved.enabled && calendars.some((c) => c.id === saved.calendarId),
			calendars
		};
	}
	configureEventQr(enabled: unknown, calendarId: unknown) {
		if (typeof enabled !== 'boolean' || typeof calendarId !== 'string')
			throw new SetupError('Choose a calendar and on or off.');
		const settings = this.eventQrSettings();
		if (
			(enabled || (calendarId && calendarId !== settings.calendarId)) &&
			!settings.calendars.some((c) => c.id === calendarId)
		)
			throw new SetupError('Choose an enabled, editable calendar.');
		this.store.set('event-qr', { enabled, calendarId });
	}
	newEventLink(date: unknown, timeZone: string) {
		const settings = this.eventQrSettings();
		if (!settings.available)
			throw new SetupError('Adding events via QR is disabled or its calendar is unavailable.', 403);
		if (typeof date !== 'string' || !isDateKey(date) || date < '1900-01-01' || date > '2099-12-31')
			throw new SetupError('Choose a valid date.');
		const link = new URL('https://calendar.google.com/calendar/render');
		link.searchParams.set('action', 'TEMPLATE');
		link.searchParams.set(
			'dates',
			date.replaceAll('-', '') + '/' + addDays(date, 1).replaceAll('-', '')
		);
		link.searchParams.set('ctz', timeZone);
		link.searchParams.set('src', settings.calendarId);
		return link.href;
	}
	private accounts() {
		return this.store.get<Account[]>('accounts') || [];
	}
	status() {
		const config = this.store.get<GoogleConfig>('config');
		const appearances = this.appearances();
		return {
			configured: !!config,
			clientId: config?.clientId || '',
			accounts: this.accounts().map((a) => ({
				id: a.id,
				label: a.label,
				error: a.error,
				calendars: a.calendars.map((c) => {
					const original = normalizeCalendar(c);
					const appearance = appearances.find((item) => item.id === original.id);
					return {
						...this.presentCalendar(original, appearances),
						sourceName: original.name,
						sourceColor: original.color,
						displayName: appearance?.name || '',
						displayColor: appearance?.color || null,
						googleId: c.id,
						selected: a.selected.includes(c.id)
					};
				})
			}))
		};
	}
	private appearances() {
		return this.store.get<CalendarAppearance[]>('calendar-appearance') || [];
	}
	private presentCalendar(calendar: Calendar, appearances: CalendarAppearance[]): Calendar {
		const appearance = appearances.find((item) => item.id === calendar.id);
		return {
			...calendar,
			name: appearance?.name || calendar.name,
			color: appearance?.color || calendar.color
		};
	}
	saveAppearance(id: unknown, name: unknown, color: unknown) {
		if (
			typeof id !== 'string' ||
			!this.accounts().some((account) =>
				account.calendars.some(
					(calendar) =>
						account.selected.includes(calendar.id) && normalizeCalendar(calendar).id === id
				)
			)
		)
			throw new SetupError('Choose an enabled calendar.');
		if (typeof name !== 'string' || name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(name))
			throw new SetupError('Use a friendly name of up to 80 characters.');
		if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)))
			throw new SetupError('Choose a valid six-digit hex colour.');
		const appearances = this.appearances().filter((item) => item.id !== id);
		if (name.trim() || color !== null)
			appearances.push({
				id,
				name: name.trim(),
				color: color === null ? null : color.toLowerCase()
			});
		this.store.set('calendar-appearance', appearances);
	}
	private mutable() {
		if (this.inFlight || this.oauthBusy)
			throw new SetupError('A Google request is in progress. Try again shortly.', 409);
	}
	saveConfig(value: unknown) {
		this.mutable();
		if (this.accounts().length)
			throw new SetupError('Disconnect accounts before replacing OAuth client credentials.', 409);
		const v = value as Partial<GoogleConfig> | null;
		if (
			!v ||
			typeof v.clientId !== 'string' ||
			!v.clientId.trim().endsWith('.apps.googleusercontent.com') ||
			v.clientId.length > 500 ||
			typeof v.clientSecret !== 'string' ||
			!v.clientSecret.trim() ||
			v.clientSecret.length > 1000
		)
			throw new SetupError('Enter a Google Web application client ID and client secret.');
		this.store.set('config', { clientId: v.clientId.trim(), clientSecret: v.clientSecret.trim() });
		this.pending.clear();
		this.store.clearCache();
		this.selectionChanged();
	}
	begin(origin: string) {
		this.mutable();
		const config = this.store.get<GoogleConfig>('config');
		if (!config) throw new SetupError('Save OAuth client credentials first.');
		const base = new URL(origin);
		if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
			throw new SetupError('Google setup currently supports this computer only.');
		for (const [key, value] of this.pending)
			if (value.expires < Date.now()) this.pending.delete(key);
		if (this.pending.size >= 20)
			throw new SetupError('Too many sign-in attempts. Try again in ten minutes.', 429);
		const state = randomBytes(32).toString('base64url'),
			binding = randomBytes(32).toString('base64url'),
			verifier = randomBytes(32).toString('base64url');
		const redirect = base.origin + '/api/google/callback';
		this.pending.set(state, {
			binding,
			verifier,
			redirect,
			expires: Date.now() + 600000,
			clientId: config.clientId
		});
		return { binding, url: this.gateway.authorize(config, redirect, state, verifier) };
	}
	async finish(state: string | null, binding: string | undefined, code: string | null) {
		const pending = state ? this.pending.get(state) : undefined;
		if (state) this.pending.delete(state);
		const hash = (s: string) => createHash('sha256').update(s).digest();
		if (
			!pending ||
			!binding ||
			pending.expires < Date.now() ||
			!timingSafeEqual(hash(binding), hash(pending.binding))
		)
			throw new SetupError(
				'Sign-in expired or could not be verified. Start again from Google settings.'
			);
		if (!code) throw new SetupError('Google sign-in was cancelled. No account was added.');
		this.mutable();
		this.oauthBusy = true;
		try {
			const config = this.store.get<GoogleConfig>('config')!;
			if (config.clientId !== pending.clientId)
				throw new SetupError('OAuth configuration changed. Start sign-in again.');
			let tokens = await this.gateway.exchange(config, pending.redirect, code, pending.verifier);
			const calendars = await this.gateway.calendars(config, tokens, (next) => {
				tokens = { ...tokens, ...next };
			});
			const primary = calendars.find((c) => c.primary);
			if (!primary)
				throw new SetupError(
					'Google did not provide a primary calendar. Check calendar permissions and reconnect.'
				);
			const id = createHash('sha256').update(primary.id).digest('hex').slice(0, 24);
			const accounts = this.accounts(),
				old = accounts.find((a) => a.id === id);
			const account: Account = {
				id,
				label: primary.summaryOverride || primary.summary || primary.id,
				tokens,
				calendars,
				selected: old
					? old.selected.filter((id) => calendars.some((c) => c.id === id))
					: calendars.map((c) => c.id)
			};
			this.store.set('accounts', [...accounts.filter((a) => a.id !== id), account]);
			this.store.clearCache();
			this.selectionChanged();
		} catch (e) {
			if (e instanceof SetupError) throw e;
			throw safeGoogleFailure(e);
		} finally {
			this.oauthBusy = false;
		}
	}
	select(accountId: string, ids: unknown) {
		this.mutable();
		const accounts = this.accounts(),
			account = accounts.find((a) => a.id === accountId);
		if (
			!account ||
			!Array.isArray(ids) ||
			ids.some((id) => typeof id !== 'string' || !account.calendars.some((c) => c.id === id))
		)
			throw new SetupError('Choose calendars from this account.');
		account.selected = [...new Set(ids)] as string[];
		this.store.set('accounts', accounts);
		this.store.clearCache();
		this.selectionChanged();
	}
	disconnect(id: string) {
		this.mutable();
		this.store.set(
			'accounts',
			this.accounts().filter((a) => a.id !== id)
		);
		this.store.clearCache();
		this.selectionChanged();
	}
	private saveTokens(id: string, next: Credentials) {
		const accounts = this.accounts();
		const account = accounts.find((a) => a.id === id);
		if (account) {
			account.tokens = { ...account.tokens, ...next };
			this.store.set('accounts', accounts);
		}
	}

	private selected() {
		const result = new Map<string, { account: Account; calendar: GoogleCalendar }>();
		for (const account of this.accounts()) {
			if (account.unavailable) continue;
			for (const calendar of account.calendars)
				if (account.selected.includes(calendar.id) && !calendar.deleted && !result.has(calendar.id))
					result.set(calendar.id, { account, calendar });
		}
		return result;
	}
	private selectionChanged() {
		this.lastMetadata = 0;
		this.extensionAttempts.clear();
		const selected = this.selected();
		this.store.mirror.transaction(() => {
			for (const id of this.store.mirror.ids())
				if (!selected.has(id)) {
					this.store.mirror.remove(id);
					this.store.remove('cursor:' + id);
				}
			for (const id of selected.keys()) {
				const state = this.store.mirror.state(id);
				state.nextAttempt = 0;
				this.store.mirror.saveState(id, state);
			}
		});
	}
	intervalSeconds() {
		return this.store.get<number>('sync-interval') || 120;
	}
	setIntervalSeconds(value: unknown) {
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 60 || value > 3600)
			throw new SetupError('Use a sync interval from 60 to 3600 seconds.');
		this.store.set('sync-interval', value);
	}
	start(timeZone: string) {
		if (this.timer || this.stopped) return;
		this.workerZone = timeZone;
		const tick = async () => {
			try {
				if (!this.oauthBusy && !this.inFlight && this.configured()) {
					await this.syncNow(timeZone, false);
					if (!this.stopped) await this.backfill(timeZone);
				}
			} catch {
				/* Per-calendar status carries provider failures; keep the worker alive. */
			}
			if (!this.stopped) {
				this.timer = setTimeout(tick, 5000);
				this.timer.unref();
			}
		};
		this.timer = setTimeout(tick, 100);
		this.timer.unref();
	}
	private async exclusive(label: string, work: () => Promise<void>) {
		while (this.inFlight) await this.inFlight;
		if (this.stopped || this.oauthBusy) return;
		this.activity = label;
		const job = work();
		this.inFlight = job;
		try {
			await job;
		} finally {
			this.inFlight = null;
			this.activity = '';
		}
	}
	private async refreshAccounts(force: boolean) {
		if (!force && Date.now() - this.lastMetadata < 15 * 60_000) return;
		const config = this.store.get<GoogleConfig>('config');
		if (!config) return;
		let ok = true;
		for (const original of this.accounts()) {
			try {
				const list = await this.gateway.calendars(config, original.tokens, (t) =>
					this.saveTokens(original.id, t)
				);
				const accounts = this.accounts();
				const account = accounts.find((a) => a.id === original.id)!;
				account.calendars = list.filter(
					(c) =>
						!c.deleted &&
						['reader', 'writerWithoutPrivateAccess', 'writer', 'owner'].includes(c.accessRole || '')
				);
				account.selected = account.selected.filter((id) =>
					account.calendars.some((c) => c.id === id)
				);
				account.error = undefined;
				account.unavailable = false;
				this.store.set('accounts', accounts);
			} catch (cause) {
				ok = false;
				const failure = safeGoogleFailure(cause);
				const accounts = this.accounts(),
					account = accounts.find((a) => a.id === original.id)!;
				account.error = failure.message;
				account.unavailable = ['authorization', 'permission'].includes(failure.kind);
				this.store.set('accounts', accounts);
				for (const id of account.selected) this.recordFailure(id, failure);
			}
		}
		// Account metadata checks are independent of event polling, and also back off after failure.
		this.lastMetadata = Date.now() - (ok ? 0 : 13 * 60_000);
		const selected = this.selected();
		for (const id of this.store.mirror.ids())
			if (!selected.has(id)) {
				this.store.mirror.transaction(() => {
					this.store.mirror.remove(id);
					this.store.remove('cursor:' + id);
				});
			}
	}
	private recordFailure(id: string, cause: unknown) {
		const failure = safeGoogleFailure(cause),
			state = this.store.mirror.state(id);
		state.failures++;
		state.error = failure.message;
		state.lastAttempt = new Date().toISOString();
		const delay = Math.min(
			3600_000,
			this.intervalSeconds() * 1000 * 2 ** Math.min(state.failures - 1, 6)
		);
		state.nextAttempt = Date.now() + Math.round(delay * (0.75 + Math.random() * 0.5));
		this.store.mirror.saveState(id, state);
		if (['authorization', 'permission'].includes(failure.kind)) {
			this.store.mirror.transaction(() => {
				this.store.mirror.clearEvents(id);
				state.ranges = [];
				state.lastSuccess = '';
				this.store.mirror.saveState(id, state);
				this.store.remove('cursor:' + id);
			});
		}
	}
	private connection(id: string) {
		const selected = this.selected().get(id),
			config = this.store.get<GoogleConfig>('config');
		if (!selected || !config)
			throw new GoogleFailure('configuration', 'Connect and enable a Google calendar.');
		return {
			...selected,
			config,
			save: (tokens: Credentials) => this.saveTokens(selected.account.id, tokens)
		};
	}
	async eventLink(value: unknown): Promise<string> {
		let identity: unknown;
		try {
			identity = typeof value === 'string' && value.length <= 4096 ? JSON.parse(value) : null;
		} catch {
			identity = null;
		}
		if (
			!Array.isArray(identity) ||
			identity.length !== 2 ||
			!identity.every((v) => typeof v === 'string' && v.length > 0)
		)
			throw new SetupError('Event not found.', 404);
		const [id, eventId] = identity as [string, string];
		let link: string | undefined;
		await this.exclusive('Preparing event link', async () => {
			const event = this.store.mirror.event(id, eventId);
			if (!this.selected().has(id) || !event)
				throw new SetupError('Event no longer available.', 404);
			link =
				googleEventLink(event.googleUrl) ||
				googleEventLink(this.store.mirror.raw(id, eventId)?.htmlLink);
			if (!link) {
				const { config, account, save } = this.connection(id);
				// Older mirrors omitted htmlLink. Fetch only this known occurrence, once, on expansion.
				link = googleEventLink(
					await this.gateway.eventLink?.(config, account.tokens, save, id, eventId)
				);
			}
			if (link) this.store.mirror.saveEventLink(id, eventId, link);
		});
		if (!link) throw new SetupError('Google Calendar link is unavailable. Try again later.', 503);
		return link;
	}
	async syncNow(timeZone: string, force = true) {
		this.workerZone = timeZone;
		if (this.inFlight) {
			await this.inFlight;
			return;
		}
		await this.exclusive('Synchronizing calendars', async () => {
			await this.refreshAccounts(force);
			for (const id of this.selected().keys()) {
				const state = this.store.mirror.state(id);
				if (!force && Date.now() < state.nextAttempt) continue;
				try {
					await this.syncCalendar(id, timeZone);
				} catch (cause) {
					this.recordFailure(id, cause);
				}
			}
		});
	}
	private async syncCalendar(id: string, timeZone: string) {
		const { config, account, save } = this.connection(id),
			mirror = this.store.mirror;
		const state = mirror.state(id),
			standard = standardRange(dateKey(new Date(), timeZone));
		let cursor = this.store.get<string>('cursor:' + id);
		let full = !cursor;
		let changes;
		try {
			changes = await this.gateway.changes(config, account.tokens, save, id, cursor);
		} catch (cause) {
			if (safeGoogleFailure(cause).kind !== 'reset') throw cause;
			full = true;
			cursor = undefined;
			changes = await this.gateway.changes(config, account.tokens, save, id);
		}
		const ranges = mergeRanges([...state.ranges, standard]);
		const missing = full ? ranges : missingRanges(standard, state.ranges);
		const windows: { range: Range; items: GoogleEvent[] }[] = [];
		for (const range of missing)
			windows.push({
				range,
				items: await this.gateway.events(
					config,
					this.connection(id).account.tokens,
					save,
					id,
					range.from,
					range.to,
					timeZone
				)
			});
		const affected = new Set<string>();
		if (!full)
			for (const item of changes.items) {
				const previous = item.id ? mirror.raw(id, item.id) : undefined;
				if (item.recurrence || previous?.recurrence) affected.add(item.id!);
				if (item.recurringEventId || previous?.recurringEventId)
					affected.add(item.recurringEventId || previous!.recurringEventId!);
			}
		const series = new Map<string, GoogleEvent[]>();
		for (const seriesId of affected) {
			const master = changes.items.find((i) => i.id === seriesId) || mirror.raw(id, seriesId);
			const items: GoogleEvent[] = [];
			if (master?.status !== 'cancelled' && (!master || !!master.recurrence))
				for (const range of ranges)
					items.push(
						...(await this.gateway.instances(
							config,
							this.connection(id).account.tokens,
							save,
							id,
							seriesId,
							range.from,
							range.to,
							timeZone
						))
					);
			if (master && master.status !== 'cancelled' && !master.recurrence && !master.recurringEventId)
				items.push(master);
			series.set(seriesId, items);
		}
		// All pages and affected series must succeed before advancing the cursor or changing displayed data.
		mirror.transaction(() => {
			if (full) mirror.clearEvents(id);
			mirror.applyRaw(id, changes.items, full);
			for (const item of changes.items) {
				if (item.status === 'cancelled' && item.id) mirror.removeEvent(id, item.id);
				else if (!item.recurrence && !item.recurringEventId) mirror.put(id, [item]);
			}
			for (const window of windows) mirror.replaceRange(id, window.range, window.items);
			for (const [seriesId, items] of series) {
				mirror.removeEvent(id, seriesId);
				mirror.put(id, items);
			}
			state.ranges = ranges;
			state.lastSuccess = state.lastAttempt = new Date().toISOString();
			state.failures = 0;
			state.error = '';
			state.nextAttempt =
				Date.now() + Math.round(this.intervalSeconds() * 1000 * (0.75 + Math.random() * 0.5));
			state.historyStart = mirror.historyStart(id);
			mirror.saveState(id, state);
			this.store.set('cursor:' + id, changes.syncToken);
		});
	}
	private async extend(id: string, range: Range, timeZone: string) {
		const state = this.store.mirror.state(id);
		const missing = missingRanges(range, state.ranges);
		if (!missing.length) return;
		const { config, account, save } = this.connection(id);
		const windows: { range: Range; items: GoogleEvent[] }[] = [];
		for (const part of missing)
			windows.push({
				range: part,
				items: await this.gateway.events(
					config,
					account.tokens,
					save,
					id,
					part.from,
					part.to,
					timeZone
				)
			});
		this.store.mirror.transaction(() => {
			for (const part of windows) this.store.mirror.replaceRange(id, part.range, part.items);
			state.ranges = mergeRanges([...state.ranges, range]);
			state.backfillAt = Date.now() + 10_000;
			this.store.mirror.saveState(id, state);
		});
	}
	async backfill(timeZone: string) {
		await this.exclusive('Importing calendar history', async () => {
			for (const id of this.selected().keys()) {
				const state = this.store.mirror.state(id),
					first = state.ranges[0]?.from;
				if (
					!first ||
					!state.historyStart ||
					state.historyStart >= first ||
					state.error ||
					Date.now() < state.backfillAt
				)
					continue;
				const from = [addDays(first, -42), state.historyStart].sort().at(-1)!;
				try {
					await this.extend(id, { from, to: first }, timeZone);
				} catch (cause) {
					this.recordFailure(id, cause);
				}
				break; // One small historical batch per worker tick, not a burst per calendar.
			}
		});
	}
	async snapshot(
		from: string,
		to: string,
		timeZone: string,
		force = false
	): Promise<CalendarSnapshot> {
		if (force) await this.syncNow(timeZone);
		const range = { from, to },
			standard = standardRange(dateKey(new Date(), timeZone));
		let selected = this.selected();
		const outside = from < standard.from || to > standard.to;
		if (
			outside &&
			[...selected.keys()].some(
				(id) => missingRanges(range, this.store.mirror.state(id).ranges).length
			)
		) {
			const key = JSON.stringify([from, to, timeZone]);
			if (Date.now() - (this.extensionAttempts.get(key) || 0) > 120_000) {
				this.extensionAttempts.set(key, Date.now());
				if (this.extensionAttempts.size > 64)
					this.extensionAttempts.delete(this.extensionAttempts.keys().next().value!);
				await this.exclusive('Loading requested dates', async () => {
					for (const id of this.selected().keys()) {
						const state = this.store.mirror.state(id);
						if (state.error && Date.now() < state.nextAttempt) continue;
						try {
							await this.extend(id, range, timeZone);
						} catch (cause) {
							this.recordFailure(id, cause);
						}
					}
				});
			}
		}
		if (outside && this.inFlight) await this.inFlight;
		selected = this.selected();
		const states = [...selected.keys()].map((id) => this.store.mirror.state(id));
		const complete = states.every((state) => !missingRanges(range, state.ranges).length);
		const errors = [
			...new Set(
				[...states.map((s) => s.error), ...this.accounts().map((a) => a.error)].filter(Boolean)
			)
		];
		const success =
			states
				.map((s) => s.lastSuccess)
				.filter(Boolean)
				.sort()[0] || '';
		return {
			source: 'google',
			from,
			to,
			timeZone,
			calendars: [...selected.values()].map(({ calendar }) =>
				this.presentCalendar(normalizeCalendar(calendar), this.appearances())
			),
			events: [...selected.keys()].flatMap((id) => this.store.mirror.read(id, range)),
			fetchedAt: complete ? success : '',
			sync: {
				stale: !complete || !!errors.length,
				message:
					errors.join(' ') ||
					(!this.accounts().length
						? 'Connect a Google account in settings.'
						: !selected.size
							? 'No calendars selected.'
							: !complete
								? 'These dates are still being imported. Saved events remain available.'
								: '')
			}
		};
	}
	systemStatus() {
		const selected = this.selected(),
			mirror = this.store.mirror;
		return {
			configured: this.configured(),
			running: !!this.inFlight,
			activity: this.activity,
			intervalSeconds: this.intervalSeconds(),
			...mirror.stats(),
			standard: standardRange(dateKey(new Date(), this.workerZone)),
			calendars: [...selected].map(([id, { calendar }]) => {
				const state = mirror.state(id);
				return {
					name: this.presentCalendar(normalizeCalendar(calendar), this.appearances()).name,
					...state,
					backfillComplete:
						!state.historyStart || (!!state.ranges[0] && state.ranges[0].from <= state.historyStart)
				};
			}),
			accountErrors: this.accounts()
				.map((a) => a.error)
				.filter((e): e is string => !!e)
		};
	}
	close() {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.store.close();
	}
}

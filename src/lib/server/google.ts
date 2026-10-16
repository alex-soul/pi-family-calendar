import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Credentials } from 'google-auth-library';
import type { CalendarSnapshot, Calendar } from '../domain.ts';
import { GoogleStore } from './google-store.ts';
import {
	LiveGoogleGateway,
	GoogleFailure,
	safeGoogleFailure,
	normalizeCalendar,
	normalizeEvent,
	type GoogleGateway,
	type GoogleConfig,
	type GoogleCalendar
} from './google-api.ts';

interface Account {
	id: string;
	label: string;
	tokens: Credentials;
	calendars: GoogleCalendar[];
	selected: string[];
	error?: string;
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
	private inFlight: Promise<CalendarSnapshot> | null = null;
	private attempts = new Map<string, number>();
	private oauthBusy = false;
	private store: GoogleStore;
	private gateway: GoogleGateway;
	constructor(store: GoogleStore, gateway: GoogleGateway = new LiveGoogleGateway()) {
		this.store = store;
		this.gateway = gateway;
	}
	configured() {
		return !!this.store.get<GoogleConfig>('config');
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
		this.attempts.clear();
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
			this.attempts.clear();
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
		this.attempts.clear();
	}
	disconnect(id: string) {
		this.mutable();
		this.store.set(
			'accounts',
			this.accounts().filter((a) => a.id !== id)
		);
		this.store.clearCache();
		this.attempts.clear();
	}
	private saveTokens(id: string, next: Credentials) {
		const accounts = this.accounts();
		const account = accounts.find((a) => a.id === id);
		if (account) {
			account.tokens = { ...account.tokens, ...next };
			this.store.set('accounts', accounts);
		}
	}
	async snapshot(
		from: string,
		to: string,
		timeZone: string,
		force = false
	): Promise<CalendarSnapshot> {
		const snapshot = await this.rawSnapshot(from, to, timeZone, force);
		const appearances = this.appearances();
		return {
			...snapshot,
			calendars: snapshot.calendars.map((calendar) => this.presentCalendar(calendar, appearances))
		};
	}
	private async rawSnapshot(
		from: string,
		to: string,
		timeZone: string,
		force = false
	): Promise<CalendarSnapshot> {
		if (this.inFlight) {
			await this.inFlight;
			return this.rawSnapshot(from, to, timeZone, force);
		}
		const key = JSON.stringify([from, to, timeZone]);
		const cached = this.store.cached(key);
		if (
			!force &&
			cached &&
			Date.now() - Date.parse(cached.fetchedAt) < 120000 &&
			!cached.sync?.stale
		)
			return cached;
		if (!force && Date.now() - (this.attempts.get(key) || 0) < 120000)
			return cached || this.empty(from, to, timeZone, 'Google sync is waiting to retry.');
		if (this.oauthBusy)
			return cached || this.empty(from, to, timeZone, 'Google sign-in is in progress.');
		const job = this.sync(from, to, timeZone, key);
		this.inFlight = job;
		try {
			return await job;
		} finally {
			this.inFlight = null;
		}
	}
	private empty(from: string, to: string, timeZone: string, message: string): CalendarSnapshot {
		return {
			source: 'google',
			calendars: [],
			events: [],
			from,
			to,
			timeZone,
			fetchedAt: '',
			sync: { stale: true, message }
		};
	}
	private async sync(
		from: string,
		to: string,
		timeZone: string,
		key: string
	): Promise<CalendarSnapshot> {
		this.attempts.set(key, Date.now());
		if (this.attempts.size > 24) this.attempts.delete(this.attempts.keys().next().value!);
		const config = this.store.get<GoogleConfig>('config'),
			accounts = this.accounts();
		if (!config || !accounts.length)
			return this.empty(from, to, timeZone, 'Connect a Google account in settings.');
		const calendars: Calendar[] = [],
			events: CalendarSnapshot['events'] = [],
			seen = new Set<string>();
		try {
			for (const original of accounts) {
				const id = original.id;
				try {
					const list = await this.gateway.calendars(config, original.tokens, (next) =>
						this.saveTokens(id, next)
					);
					const updated = this.accounts(),
						account = updated.find((a) => a.id === id)!;
					const available = list.filter(
						(c) =>
							!c.deleted &&
							['reader', 'writerWithoutPrivateAccess', 'writer', 'owner'].includes(
								c.accessRole || ''
							)
					);
					const selected = account.selected.filter((id) => available.some((c) => c.id === id));
					if (selected.length !== account.selected.length) this.store.clearCache();
					account.calendars = available;
					account.selected = selected;
					account.error = undefined;
					this.store.set('accounts', updated);
					for (const c of available.filter((c) => selected.includes(c.id))) {
						if (seen.has(c.id)) continue;
						const tokens = this.accounts().find((a) => a.id === id)!.tokens;
						const items = await this.gateway.events(
							config,
							tokens,
							(next) => this.saveTokens(id, next),
							c.id,
							from,
							to,
							timeZone
						);
						calendars.push(normalizeCalendar(c));
						seen.add(c.id);
						for (const item of items) {
							const event = normalizeEvent(item, c.id);
							if (event) events.push(event);
						}
					}
				} catch (e) {
					const failure = safeGoogleFailure(e);
					const current = this.accounts(),
						account = current.find((a) => a.id === id)!;
					account.error = failure.message;
					this.store.set('accounts', current);
					if (failure.kind === 'permission' || failure.kind === 'authorization')
						this.store.clearCache();
					throw failure;
				}
			}
			const snapshot: CalendarSnapshot = {
				source: 'google',
				calendars,
				events,
				from,
				to,
				timeZone,
				fetchedAt: new Date().toISOString(),
				sync: {
					stale: false,
					message: calendars.length
						? ''
						: 'No calendars selected. Choose calendars in Google settings.'
				}
			};
			this.store.cache(key, snapshot);
			return snapshot;
		} catch (e) {
			const failure = safeGoogleFailure(e),
				cached = this.store.cached(key);
			if (cached) {
				const stale = { ...cached, sync: { stale: true, message: failure.message } };
				this.store.cache(key, stale);
				return stale;
			}
			return this.empty(from, to, timeZone, failure.message);
		}
	}
	close() {
		this.store.close();
	}
}

import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { isDateKey } from '../dates.ts';
import { googleEventLink } from '../google-event-link.ts';
import type { Calendar, CalendarEvent } from '../domain.ts';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export interface GoogleConfig {
	clientId: string;
	clientSecret: string;
}
export interface GoogleCalendar {
	id: string;
	summary?: string;
	summaryOverride?: string;
	backgroundColor?: string;
	accessRole?: string;
	primary?: boolean;
	deleted?: boolean;
}
export interface GoogleEvent {
	htmlLink?: string;
	id?: string;
	status?: string;
	recurrence?: string[];
	recurringEventId?: string;
	originalStartTime?: { date?: string; dateTime?: string };
	summary?: string;
	description?: string;
	location?: string;
	start?: { date?: string; dateTime?: string };
	end?: { date?: string; dateTime?: string };
}
export class GoogleFailure extends Error {
	kind: 'authorization' | 'permission' | 'temporary' | 'configuration' | 'reset';
	constructor(
		kind: 'authorization' | 'permission' | 'temporary' | 'configuration' | 'reset',
		message: string
	) {
		super(message);
		this.kind = kind;
	}
}
export function safeGoogleFailure(cause: unknown): GoogleFailure {
	if (cause instanceof GoogleFailure) return cause;
	const e = cause as {
		response?: { status?: number; data?: { error?: string | { errors?: { reason?: string }[] } } };
	};
	const status = e?.response?.status;
	const providerError = e?.response?.data?.error;
	const reasons =
		typeof providerError === 'object' ? providerError.errors?.map((item) => item.reason) || [] : [];
	if (
		status === 429 ||
		reasons.some((reason) =>
			[
				'rateLimitExceeded',
				'userRateLimitExceeded',
				'quotaExceeded',
				'dailyLimitExceeded'
			].includes(reason || '')
		)
	)
		return new GoogleFailure(
			'temporary',
			'Google request limit reached. Retrying automatically; cached events are retained.'
		);
	if (providerError === 'invalid_client')
		return new GoogleFailure(
			'configuration',
			'Google rejected the OAuth client credentials. Check Google settings.'
		);
	if (status === 410)
		return new GoogleFailure('reset', 'Google requested a fresh synchronization.');
	if (status === 401 || e?.response?.data?.error === 'invalid_grant')
		return new GoogleFailure(
			'authorization',
			'Google sign-in has expired or been revoked. Reconnect the account.'
		);
	if (status === 403 || status === 404)
		return new GoogleFailure(
			'permission',
			'Google denied calendar access. Check permissions and that the Calendar API is enabled.'
		);
	return new GoogleFailure(
		'temporary',
		'Google could not be reached or its request limit was reached. Retrying automatically.'
	);
}
export interface GoogleGateway {
	eventLink?(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		calendarId: string,
		eventId: string
	): Promise<string | undefined>;
	authorize(config: GoogleConfig, redirect: string, state: string, verifier: string): string;
	exchange(
		config: GoogleConfig,
		redirect: string,
		code: string,
		verifier: string
	): Promise<Credentials>;
	calendars(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void
	): Promise<GoogleCalendar[]>;
	events(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		calendarId: string,
		from: string,
		to: string,
		timeZone: string
	): Promise<GoogleEvent[]>;
	changes(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		calendarId: string,
		syncToken?: string
	): Promise<{ items: GoogleEvent[]; syncToken: string }>;
	instances(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		calendarId: string,
		seriesId: string,
		from: string,
		to: string,
		timeZone: string
	): Promise<GoogleEvent[]>;
}
function client(
	config: GoogleConfig,
	tokens?: Credentials,
	save?: (tokens: Credentials) => void,
	redirect?: string
) {
	const auth = new OAuth2Client({
		clientId: config.clientId,
		clientSecret: config.clientSecret,
		redirectUri: redirect,
		transporterOptions: { timeout: 15000, retry: false }
	});
	if (tokens) auth.setCredentials(tokens);
	if (save) auth.on('tokens', save);
	return auth;
}
export class LiveGoogleGateway implements GoogleGateway {
	async eventLink(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		calendarId: string,
		eventId: string
	) {
		try {
			this.onRequest();
			const response = await client(config, tokens, save).request<GoogleEvent>({
				url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?fields=id,status,htmlLink`,
				method: 'GET',
				timeout: 15000,
				retry: false
			});
			return response.data.status === 'cancelled'
				? undefined
				: googleEventLink(response.data.htmlLink);
		} catch (cause) {
			throw safeGoogleFailure(cause);
		}
	}
	private onRequest: () => void;
	constructor(onRequest: () => void = () => {}) {
		this.onRequest = onRequest;
	}
	authorize(config: GoogleConfig, redirect: string, state: string, verifier: string) {
		return client(config, undefined, undefined, redirect).generateAuthUrl({
			access_type: 'offline',
			scope: [GOOGLE_SCOPE],
			prompt: 'consent select_account',
			state,
			code_challenge: createHash('sha256').update(verifier).digest('base64url'),
			code_challenge_method: CodeChallengeMethod.S256
		});
	}
	async exchange(config: GoogleConfig, redirect: string, code: string, verifier: string) {
		try {
			const { tokens } = await client(config, undefined, undefined, redirect).getToken({
				code,
				codeVerifier: verifier
			});
			if (!tokens.refresh_token)
				throw new GoogleFailure(
					'authorization',
					'Google did not return offline access. Remove this app from your Google account permissions, then connect again.'
				);
			if (!tokens.scope?.split(' ').includes(GOOGLE_SCOPE))
				throw new GoogleFailure(
					'permission',
					'Calendar read permission was not granted. Connect again and allow calendar access.'
				);
			return tokens;
		} catch (e) {
			throw safeGoogleFailure(e);
		}
	}
	private async pages<T>(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		path: string,
		query: Record<string, string>
	): Promise<T[]> {
		const auth = client(config, tokens, save);
		try {
			return await collectPages<T>(async (pageToken) => {
				const url = new URL('https://www.googleapis.com/calendar/v3/' + path);
				for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
				if (pageToken) url.searchParams.set('pageToken', pageToken);
				this.onRequest();
				const response = await auth.request<{ items?: T[]; nextPageToken?: string }>({
					url: url.href,
					method: 'GET',
					timeout: 15000,
					retry: false
				});
				return response.data;
			});
		} catch (e) {
			throw safeGoogleFailure(e);
		}
	}
	calendars(config: GoogleConfig, tokens: Credentials, save: (tokens: Credentials) => void) {
		return this.pages<GoogleCalendar>(config, tokens, save, 'users/me/calendarList', {
			maxResults: '250',
			minAccessRole: 'reader',
			showHidden: 'true'
		});
	}
	async changes(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		id: string,
		syncToken?: string
	) {
		const auth = client(config, tokens, save);
		try {
			return await collectChanges(async (pageToken) => {
				const url = new URL(
					`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
				);
				for (const [key, value] of Object.entries(changeQuery(syncToken, pageToken)))
					url.searchParams.set(key, value);
				this.onRequest();
				const response = await auth.request<ChangePage>({
					url: url.href,
					method: 'GET',
					timeout: 15000,
					retry: false
				});
				return response.data;
			});
		} catch (cause) {
			throw safeGoogleFailure(cause);
		}
	}
	instances(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		id: string,
		seriesId: string,
		from: string,
		to: string,
		timeZone: string
	) {
		return this.pages<GoogleEvent>(
			config,
			tokens,
			save,
			`calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(seriesId)}/instances`,
			{
				timeMin: new Date(Date.parse(from + 'T00:00:00Z') - 86400000).toISOString(),
				timeMax: new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString(),
				timeZone,
				showDeleted: 'false',
				maxResults: '2500'
			}
		);
	}

	events(
		config: GoogleConfig,
		tokens: Credentials,
		save: (tokens: Credentials) => void,
		id: string,
		from: string,
		to: string,
		timeZone: string
	) {
		// Pad UTC boundaries to cover every local date in any IANA zone; the display index clips to its date range.
		const timeMin = new Date(Date.parse(from + 'T00:00:00Z') - 86400000).toISOString();
		const timeMax = new Date(Date.parse(to + 'T00:00:00Z') + 86400000).toISOString();
		return this.pages<GoogleEvent>(
			config,
			tokens,
			save,
			`calendars/${encodeURIComponent(id)}/events`,
			{
				timeMin,
				timeMax,
				timeZone,
				singleEvents: 'true',
				showDeleted: 'false',
				orderBy: 'startTime',
				maxResults: '2500'
			}
		);
	}
}
export function calendarId(id: string) {
	return 'google:' + id;
}
export function normalizeCalendar(c: GoogleCalendar): Calendar {
	return {
		id: calendarId(c.id),
		name: c.summaryOverride || c.summary || 'Calendar',
		color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor || '') ? c.backgroundColor! : '#759bac',
		writable: false
	};
}
export function normalizeEvent(event: GoogleEvent, id: string): CalendarEvent | null {
	if (event.status === 'cancelled') return null;
	if (!event.id || !event.start || !event.end)
		throw new GoogleFailure(
			'temporary',
			'Google returned an incomplete event. Last successful data is retained.'
		);
	const base = {
		...(googleEventLink(event.htmlLink) ? { googleUrl: googleEventLink(event.htmlLink) } : {}),
		id: JSON.stringify([id, event.id]),
		calendarId: calendarId(id),
		title: event.summary?.trim() || '(Untitled)',
		description: event.description,
		location: event.location
	};
	if (
		event.start.date &&
		event.end.date &&
		isDateKey(event.start.date) &&
		isDateKey(event.end.date) &&
		event.end.date > event.start.date
	)
		return { ...base, kind: 'all-day', startDate: event.start.date, endDate: event.end.date };
	const start = event.start.dateTime,
		end = event.end.dateTime;
	if (
		start &&
		end &&
		/(Z|[+-]\d{2}:\d{2})$/.test(start) &&
		/(Z|[+-]\d{2}:\d{2})$/.test(end) &&
		Number.isFinite(Date.parse(start)) &&
		Date.parse(end) >= Date.parse(start)
	)
		return { ...base, kind: 'timed', start, end };
	throw new GoogleFailure(
		'temporary',
		'Google returned an unsupported event date. Last successful data is retained.'
	);
}

/** Collect every page before replacing a cached window; never commit partial pages. */
export async function collectPages<T>(
	load: (pageToken?: string) => Promise<{ items?: T[]; nextPageToken?: string }>
): Promise<T[]> {
	const items: T[] = [],
		seen = new Set<string>();
	let pageToken: string | undefined;
	for (let page = 0; page < 100; page++) {
		const result = await load(pageToken);
		if (
			!result ||
			(result.items !== undefined && !Array.isArray(result.items)) ||
			(result.nextPageToken !== undefined && typeof result.nextPageToken !== 'string')
		)
			throw new GoogleFailure(
				'temporary',
				'Google returned an invalid page. Last successful data is retained.'
			);
		items.push(...(result.items || []));
		pageToken = result.nextPageToken;
		if (!pageToken) return items;
		if (seen.has(pageToken)) break;
		seen.add(pageToken);
	}
	throw new GoogleFailure(
		'temporary',
		'Google pagination could not be completed. Last successful data is retained.'
	);
}

interface ChangePage {
	items?: GoogleEvent[];
	nextPageToken?: string;
	nextSyncToken?: string;
}
/** Never put rolling time filters on an incremental cursor. */
export function changeQuery(syncToken?: string, pageToken?: string): Record<string, string> {
	return {
		singleEvents: 'false',
		showDeleted: 'true',
		maxResults: '2500',
		fields:
			'items(id,status,summary,description,location,start,end,recurrence,recurringEventId,originalStartTime),nextPageToken,nextSyncToken',
		...(syncToken ? { syncToken } : {}),
		...(pageToken ? { pageToken } : {})
	};
}
export async function collectChanges(load: (pageToken?: string) => Promise<ChangePage>) {
	let nextSyncToken: string | undefined;
	const items = await collectPages<GoogleEvent>(async (pageToken) => {
		const result = await load(pageToken);
		if (!result.nextPageToken) nextSyncToken = result.nextSyncToken;
		return result;
	});
	if (!nextSyncToken || typeof nextSyncToken !== 'string')
		throw new GoogleFailure(
			'temporary',
			'Google did not return a complete sync cursor. Last successful data is retained.'
		);
	return { items, syncToken: nextSyncToken };
}

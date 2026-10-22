import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export class KioskTheme {
	private db: DatabaseSync;
	private token = '';
	private heartbeat = 0;
	private revision = 0;
	private pending: { theme: string; expires: number } | null = null;
	private now: () => number;
	constructor(path: string, now = Date.now) {
		this.now = now;
		this.db = new DatabaseSync(path);
		this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
		this.db.exec('CREATE TABLE IF NOT EXISTS kiosk_theme(value TEXT NOT NULL)');
	}
	private stored() {
		return String(this.db.prepare('SELECT value FROM kiosk_theme LIMIT 1').get()?.value || '');
	}
	private save(theme: string) {
		this.db.exec('BEGIN IMMEDIATE');
		try {
			this.db.exec('DELETE FROM kiosk_theme');
			this.db.prepare('INSERT INTO kiosk_theme VALUES(?)').run(theme);
			this.db.exec('COMMIT');
		} catch (e) {
			this.db.exec('ROLLBACK');
			throw e;
		}
	}
	register() {
		this.token = randomBytes(32).toString('hex');
		this.heartbeat = 0;
		this.pending = null;
		this.revision++;
		return this.token;
	}
	private expire() {
		if (this.pending && this.pending.expires < this.now()) {
			this.pending = null;
			this.revision++;
			this.heartbeat = 0;
		}
	}
	status() {
		this.expire();
		return {
			theme: this.stored(),
			available:
				!!this.token && this.heartbeat > 0 && this.now() - this.heartbeat < 8000 && !this.pending
		};
	}
	command(theme: unknown) {
		this.expire();
		if (!['Warm', 'Dark'].includes(String(theme)) || !this.status().available)
			throw new Error('Kiosk theme unavailable.');
		this.pending = { theme: String(theme).toLowerCase(), expires: this.now() + 5000 };
		this.revision++;
		return { queued: true };
	}
	exchange(token: string, body: { theme?: unknown; revision?: unknown; ready?: unknown }) {
		if (!this.token || token !== this.token)
			throw new Error('Kiosk session expired. Reload the kiosk.');
		this.expire();
		if (!['warm', 'dark'].includes(String(body.theme))) throw new Error('Invalid theme.');
		if (body.ready !== true) {
			this.heartbeat = 0;
			return { theme: this.pending?.theme || this.stored() || body.theme, revision: this.revision };
		}
		if (!this.stored()) this.save(String(body.theme));
		if (body.revision === this.revision) {
			if (this.pending) {
				if (body.theme === this.pending.theme) {
					this.save(this.pending.theme);
					this.pending = null;
					this.heartbeat = this.now();
				}
			} else {
				if (body.theme !== this.stored()) {
					this.save(String(body.theme));
					this.revision++;
				}
				this.heartbeat = this.now();
			}
		}
		return { theme: this.pending?.theme || this.stored(), revision: this.revision };
	}
	close() {
		this.db.close();
	}
}
let service: KioskTheme | undefined;
export function kioskTheme() {
	return (service ??= new KioskTheme(join(process.env.DATA_DIR || 'data', 'calendar.sqlite')));
}
export function themeEnabled() {
	return !!process.env.KIOSK_THEME_TOKEN_FILE;
}
export function hostThemeAuthorized(header: string | null) {
	try {
		const secret = readFileSync(process.env.KIOSK_THEME_TOKEN_FILE!, 'utf8').trim();
		const supplied = header?.replace(/^Bearer /, '') || '';
		return (
			secret.length >= 32 &&
			supplied.length === secret.length &&
			timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
		);
	} catch {
		return false;
	}
}

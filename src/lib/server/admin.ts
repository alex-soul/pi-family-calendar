import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SESSION_SECONDS = 12 * 60 * 60;
export const ADMIN_COOKIE = 'calendar-admin';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const derive = (pin: string, salt: string) =>
	new Promise<Buffer>((resolve, reject) =>
		scrypt(pin, salt, 64, (error, key) => (error ? reject(error) : resolve(key)))
	);
export class AdminError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}
interface State {
	hash: string | null;
	salt: string | null;
	attempts: number;
	window: number;
}
export class AdminAccess {
	private db: DatabaseSync;
	private busy = false;
	private now: () => number;
	constructor(path: string, now = () => Date.now()) {
		this.now = now;
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS access (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT, salt TEXT, attempts INTEGER NOT NULL DEFAULT 0, window INTEGER NOT NULL DEFAULT 0);
   INSERT OR IGNORE INTO access(id) VALUES(1);
   CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
	}
	private state() {
		return this.db.prepare('SELECT * FROM access WHERE id=1').get() as unknown as State;
	}
	enabled() {
		return !!this.state().hash;
	}
	authorized(token?: string) {
		if (!this.enabled()) return true;
		if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
		return !!this.db
			.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?')
			.get(digest(token), this.now());
	}
	private attempt() {
		const state = this.state();
		if (this.now() - state.window >= 60_000)
			this.db.prepare('UPDATE access SET attempts=1, window=? WHERE id=1').run(this.now());
		else {
			if (state.attempts >= 5)
				throw new AdminError('Too many attempts. Wait one minute and try again.', 429);
			this.db.prepare('UPDATE access SET attempts=attempts+1 WHERE id=1').run();
		}
	}
	private async verify(pin: unknown) {
		this.attempt();
		const state = this.state();
		if (typeof pin !== 'string' || !/^\d{6,12}$/.test(pin) || !state.hash || !state.salt)
			throw new AdminError('Incorrect PIN.', 401);
		const key = await derive(pin, state.salt);
		if (!timingSafeEqual(key, Buffer.from(state.hash, 'hex')))
			throw new AdminError('Incorrect PIN.', 401);
	}
	private session() {
		this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.now());
		const token = randomBytes(32).toString('hex');
		this.db
			.prepare('INSERT INTO sessions VALUES (?,?)')
			.run(digest(token), this.now() + SESSION_SECONDS * 1000);
		return token;
	}
	private async exclusive<T>(work: () => Promise<T>) {
		if (this.busy) throw new AdminError('Another access request is in progress. Try again.', 429);
		this.busy = true;
		try {
			return await work();
		} finally {
			this.busy = false;
		}
	}
	async login(pin: unknown) {
		return this.exclusive(async () => {
			if (!this.enabled()) return null;
			await this.verify(pin);
			this.db.prepare('UPDATE access SET attempts=0 WHERE id=1').run();
			return this.session();
		});
	}
	async configure(currentPin: unknown, newPin: unknown, token?: string) {
		return this.exclusive(async () => {
			if (!this.authorized(token)) throw new AdminError('Unlock admin to continue.', 401);
			if (newPin !== null && (typeof newPin !== 'string' || !/^\d{6}$/.test(newPin)))
				throw new AdminError('Use a PIN of exactly 6 digits.');
			if (this.enabled()) await this.verify(currentPin);
			const salt = newPin === null ? null : randomBytes(16).toString('hex');
			const hash = newPin === null ? null : (await derive(newPin as string, salt!)).toString('hex');
			this.db.exec('BEGIN IMMEDIATE');
			try {
				this.db
					.prepare('UPDATE access SET hash=?, salt=?, attempts=0, window=0 WHERE id=1')
					.run(hash, salt);
				this.db.exec('DELETE FROM sessions; COMMIT;');
			} catch (cause) {
				this.db.exec('ROLLBACK');
				throw cause;
			}
			return hash ? this.session() : null;
		});
	}
	logout(token?: string) {
		if (token) this.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
	}
	close() {
		this.db.close();
	}
}

/** Route IDs are canonical, including encoded paths and SvelteKit data requests. */
export function requiresAdmin(route: string, method: string) {
	if (route === '/api/kiosk-theme') return false;
	if (route === '/api/calendar/event-qr' && method === 'POST') return false;
	if (['/api/qr/issue', '/api/qr/session', '/api/qr/reminder'].includes(route)) return false;
	if (route === '/admin/login' || route === '/api/admin/session') return false;
	if (route === '/admin' || route.startsWith('/admin/')) return true;
	if (
		route === '/api/google' ||
		route.startsWith('/api/google/') ||
		route.startsWith('/api/admin/')
	)
		return true;
	if (route === '/api/reminders/[id]/complete' && method === 'POST') return false;
	return route.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

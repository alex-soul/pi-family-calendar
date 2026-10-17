import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class QrError extends Error {
	status: number;
	constructor(message: string, status = 403) {
		super(message);
		this.status = status;
	}
}
export interface Grant {
	id: string | null;
	expires: number;
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export class QrAccess {
	private db: DatabaseSync;
	private now: () => number;
	constructor(path: string | DatabaseSync, now = () => Date.now()) {
		this.now = now;
		if (typeof path === 'string' && path !== ':memory:')
			mkdirSync(dirname(path), { recursive: true });
		this.db = typeof path === 'string' ? new DatabaseSync(path) : path;
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings VALUES ('enabled','0');
      CREATE TABLE IF NOT EXISTS grants (token TEXT PRIMARY KEY, id TEXT, expires INTEGER NOT NULL, stage TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (token TEXT NOT NULL, request TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(token,request));`);
	}
	enabled() {
		return this.db.prepare("SELECT value FROM settings WHERE key='enabled'").get()?.value === '1';
	}
	configure(enabled: boolean) {
		this.db.prepare("UPDATE settings SET value=? WHERE key='enabled'").run(enabled ? '1' : '0');
		this.db.exec('DELETE FROM grants; DELETE FROM receipts;');
	}
	private clean() {
		this.db.prepare('DELETE FROM grants WHERE expires<=?').run(this.now());
		this.db.exec('DELETE FROM receipts WHERE token NOT IN (SELECT token FROM grants)');
	}
	private require(token: string, stage: string): Grant {
		if (!this.enabled() || !/^[a-f0-9]{64}$/.test(token))
			throw new QrError('Access ended. Scan a new QR code.');
		const row = this.db
			.prepare('SELECT id, expires FROM grants WHERE token=? AND stage=? AND expires>?')
			.get(digest(token), stage, this.now()) as unknown as Grant | undefined;
		if (!row) throw new QrError('Access ended. Scan a new QR code.');
		return row;
	}
	issue(id: string | null) {
		if (!this.enabled()) throw new QrError('QR management is disabled.');
		this.clean();
		if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM grants').get()?.n) >= 200)
			throw new QrError('Please wait before requesting another QR code.', 429);
		return this.insert(id, 'scan', 5 * 60_000);
	}
	private insert(id: string | null, stage: string, duration: number) {
		const token = randomBytes(32).toString('hex'),
			expires = this.now() + duration;
		this.db.prepare('INSERT INTO grants VALUES (?,?,?,?)').run(digest(token), id, expires, stage);
		return { token, expires, id };
	}
	redeem(token: string) {
		const grant = this.require(token, 'scan');
		this.db.prepare('DELETE FROM grants WHERE token=?').run(digest(token));
		return this.insert(grant.id, 'session', 15 * 60_000);
	}
	session(token: string) {
		return this.require(token, 'session');
	}
	finish(token: string) {
		this.db.prepare('DELETE FROM receipts WHERE token=?').run(digest(token));
		this.db.prepare('DELETE FROM grants WHERE token=?').run(digest(token));
	}
	// Synchronous operations cannot interleave. Receipts make network retries safe;
	// an edit receipt remains readable after the grant is consumed, until its original expiry.
	save<T>(token: string, request: string, work: (grant: Grant) => T): T {
		if (!/^[a-zA-Z0-9-]{16,80}$/.test(request))
			throw new QrError('A save identifier is required.', 400);
		let grant: Grant;
		try {
			grant = this.require(token, 'session');
		} catch {
			this.require(token, 'saved');
			const receipt = this.db
				.prepare('SELECT result FROM receipts WHERE token=? AND request=?')
				.get(digest(token), request);
			if (!receipt) throw new QrError('Access ended. Scan a new QR code.');
			return JSON.parse(String(receipt.result));
		}
		const receipt = this.db
			.prepare('SELECT result FROM receipts WHERE token=? AND request=?')
			.get(digest(token), request);
		if (receipt) return JSON.parse(String(receipt.result));
		this.db.exec('BEGIN IMMEDIATE');
		try {
			const result = work(grant);
			this.db
				.prepare('INSERT INTO receipts VALUES (?,?,?)')
				.run(digest(token), request, JSON.stringify(result));
			if (grant.id)
				this.db.prepare("UPDATE grants SET stage='saved' WHERE token=?").run(digest(token));
			this.db.exec('COMMIT');
			return result;
		} catch (cause) {
			this.db.exec('ROLLBACK');
			throw cause;
		}
	}
	close() {
		this.db.close();
	}
}

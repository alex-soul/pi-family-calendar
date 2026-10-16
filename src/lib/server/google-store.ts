import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CalendarSnapshot } from '../domain.ts';

/** Secrets are encrypted separately from the event cache. Protect/backup the entire data directory. */
export class GoogleStore {
	private db: DatabaseSync;
	private key: Buffer;
	constructor(directory: string) {
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		const keyPath = join(directory, 'google.key');
		const dbPath = join(directory, 'google.sqlite');
		if (!existsSync(keyPath)) {
			if (existsSync(dbPath))
				throw new Error('Google credential key is missing. Restore it with the database.');
			writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
		}
		this.key = readFileSync(keyPath);
		if (this.key.length !== 32) throw new Error('Google credential key is invalid.');
		this.db = new DatabaseSync(dbPath);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS secrets (id TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS cache (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);`);
	}
	get<T>(id: string): T | undefined {
		const row = this.db.prepare('SELECT value FROM secrets WHERE id=?').get(id) as
			{ value: string } | undefined;
		if (!row) return;
		const [iv, tag, data] = row.value.split('.').map((v) => Buffer.from(v, 'base64'));
		const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
		decipher.setAAD(Buffer.from(id));
		decipher.setAuthTag(tag);
		return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
	}
	set(id: string, value: unknown) {
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', this.key, iv);
		cipher.setAAD(Buffer.from(id));
		const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
		this.db
			.prepare('INSERT OR REPLACE INTO secrets VALUES (?,?)')
			.run(id, [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.'));
	}
	remove(id: string) {
		this.db.prepare('DELETE FROM secrets WHERE id=?').run(id);
	}
	cached(id: string): CalendarSnapshot | undefined {
		const row = this.db.prepare('SELECT value FROM cache WHERE id=?').get(id) as
			{ value: string } | undefined;
		return row ? JSON.parse(row.value) : undefined;
	}
	cache(id: string, value: CalendarSnapshot) {
		this.db
			.prepare('INSERT OR REPLACE INTO cache VALUES (?,?,?)')
			.run(id, JSON.stringify(value), Date.now());
		this.db.exec(
			'DELETE FROM cache WHERE id NOT IN (SELECT id FROM cache ORDER BY updated DESC LIMIT 12)'
		);
	}
	clearCache() {
		this.db.exec('DELETE FROM cache');
	}
	close() {
		this.db.close();
	}
}

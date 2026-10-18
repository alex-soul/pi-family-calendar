// Run with the application's Node 24 image. No application services are started here.
import { backup, DatabaseSync } from 'node:sqlite';
import { createHash, createDecipheriv } from 'node:crypto';
import {
	mkdirSync,
	readFileSync,
	writeFileSync,
	copyFileSync,
	chmodSync,
	lstatSync,
	rmSync,
	readdirSync
} from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = ['calendar.sqlite', 'admin.sqlite', 'google.sqlite', 'google.key'];
const applicationVersion = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url))
).version;
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
function regular(path) {
	if (!lstatSync(path).isFile()) throw new Error('Expected a regular data file.');
}
function separate(source, destination) {
	const rel = relative(source, destination);
	if (
		!rel ||
		(!isAbsolute(rel) &&
			rel !== '..' &&
			!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))
	)
		throw new Error('Destination must be outside the source directory.');
}
function inspect(directory) {
	for (const file of files) regular(join(directory, file));
	const key = readFileSync(join(directory, 'google.key'));
	if (key.length !== 32) throw new Error('Invalid Google key.');
	const result = {};
	for (const name of files.filter((file) => file.endsWith('.sqlite'))) {
		const db = new DatabaseSync(join(directory, name), { readOnly: true });
		try {
			if (
				db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
				db.prepare('PRAGMA foreign_key_check').all().length
			)
				throw new Error('Database integrity check failed.');
			const schema = Number(db.prepare('PRAGMA user_version').get().user_version);
			if (name === 'calendar.sqlite' && schema !== 5)
				throw new Error('Unsupported reminder schema. Use the matching application image.');
			if (name !== 'calendar.sqlite' && schema !== 0)
				throw new Error('Unsupported database schema.');
			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
				)
				.all();
			const counts = Object.fromEntries(
				tables.map(({ name }) => {
					const quoted = '"' + name.replaceAll('"', '""') + '"';
					return [name, Number(db.prepare(`SELECT count(*) AS n FROM ${quoted}`).get().n)];
				})
			);
			if (name === 'admin.sqlite' && (!('access' in counts) || !('sessions' in counts)))
				throw new Error('Missing admin schema.');
			if (name === 'google.sqlite') {
				let mirror = false;
				for (const row of db.prepare('SELECT id,value FROM secrets').all()) {
					const [iv, tag, encrypted] = row.value
						.split('.')
						.map((value) => Buffer.from(value, 'base64'));
					const cipher = createDecipheriv('aes-256-gcm', key, iv);
					cipher.setAAD(Buffer.from(row.id));
					cipher.setAuthTag(tag);
					const value = JSON.parse(
						Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8')
					);
					if (row.id === 'mirror-format') {
						if (value !== 1) throw new Error('Unsupported calendar mirror format.');
						mirror = true;
					}
				}
				if (!mirror) throw new Error('Missing calendar mirror format.');
			}
			result[name] = { schema, counts };
		} finally {
			db.close();
		}
	}
	key.fill(0);
	return result;
}

export async function createBackup(source, destination, imageReference = '') {
	source = resolve(source);
	destination = resolve(destination);
	separate(source, destination);
	for (const file of files) regular(join(source, file));
	// Exclusive creation refuses replacement of any prior backup.
	mkdirSync(destination, { mode: 0o700 });
	try {
		const key = readFileSync(join(source, 'google.key'));
		for (const file of files.filter((name) => name.endsWith('.sqlite'))) {
			const db = new DatabaseSync(join(source, file), { readOnly: true });
			try {
				await backup(db, join(destination, file));
			} finally {
				db.close();
			}
			const snapshot = new DatabaseSync(join(destination, file));
			try {
				snapshot.exec('PRAGMA journal_mode=DELETE');
			} finally {
				snapshot.close();
			}
			chmodSync(join(destination, file), 0o600);
		}
		if (!key.equals(readFileSync(join(source, 'google.key'))))
			throw new Error('Google key changed during backup.');
		writeFileSync(join(destination, 'google.key'), key, { flag: 'wx', mode: 0o600 });
		key.fill(0);
		const databases = inspect(destination);
		const manifest = {
			format: 1,
			createdAt: new Date().toISOString(),
			applicationVersion,
			applicationRevision: process.env.APP_REVISION || 'development',
			imageReference,
			databases,
			files: Object.fromEntries(files.map((file) => [file, hash(join(destination, file))]))
		};
		writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
			flag: 'wx',
			mode: 0o600
		});
		return manifest;
	} catch (error) {
		// Only the new, exclusively created output belongs to this invocation.
		rmSync(destination, { recursive: true, force: true });
		throw error;
	}
}

export function verifyBackup(source) {
	source = resolve(source);
	regular(join(source, 'manifest.json'));
	const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
	if (
		manifest.format !== 1 ||
		manifest.applicationVersion !== applicationVersion ||
		JSON.stringify(Object.keys(manifest.files || {}).sort()) !== JSON.stringify([...files].sort())
	)
		throw new Error('Unsupported backup format or application version. Use its matching image.');
	for (const file of files) {
		regular(join(source, file));
		if (hash(join(source, file)) !== manifest.files[file])
			throw new Error('Backup checksum mismatch.');
	}
	// A bundle must contain standalone snapshots, not a WAL overriding checked bytes.
	if (readdirSync(source).some((file) => ![...files, 'manifest.json'].includes(file)))
		throw new Error('Unexpected files in backup directory.');
	const databases = inspect(source);
	if (JSON.stringify(databases) !== JSON.stringify(manifest.databases))
		throw new Error('Backup inventory mismatch.');
	return manifest;
}

export function restoreBackup(source, destination) {
	source = resolve(source);
	destination = resolve(destination);
	separate(source, destination);
	const manifest = verifyBackup(source);
	mkdirSync(destination, { mode: 0o700 });
	try {
		for (const file of files) {
			copyFileSync(join(source, file), join(destination, file));
			chmodSync(join(destination, file), 0o600);
			if (hash(join(destination, file)) !== manifest.files[file])
				throw new Error('Restore copy mismatch.');
		}
		// Invalidate copied bearer capabilities; preserve PIN, QR policy and reminder history.
		for (const [name, tables] of [
			['admin.sqlite', ['sessions']],
			['calendar.sqlite', ['grants', 'receipts']]
		]) {
			const db = new DatabaseSync(join(destination, name));
			try {
				db.exec('BEGIN IMMEDIATE');
				for (const table of tables) {
					if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
						db.exec(`DELETE FROM ${table}`);
				}
				db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
			} finally {
				db.close();
			}
		}
		inspect(destination);
		return manifest;
	} catch (error) {
		rmSync(destination, { recursive: true, force: true });
		throw error;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [command, source, destination, imageReference = ''] = process.argv.slice(2);
	try {
		if (
			!source ||
			!['backup', 'verify', 'restore'].includes(command) ||
			(command !== 'verify' && !destination)
		)
			throw new Error(
				'Usage: data-tool.mjs backup SOURCE NEW_DIRECTORY [IMAGE_REFERENCE] | verify BACKUP | restore BACKUP NEW_DIRECTORY'
			);
		if (command === 'backup') await createBackup(source, destination, imageReference);
		else if (command === 'verify') verifyBackup(source);
		else restoreBackup(source, destination);
		console.log(`${command}: complete`);
	} catch {
		// SQLite/provider values and paths can contain private information. Do not dump raw errors.
		console.error(
			`${command || 'data-tool'} failed. Check paths, permissions, matching image, complete files and an unused destination.`
		);
		process.exitCode = 1;
	}
}

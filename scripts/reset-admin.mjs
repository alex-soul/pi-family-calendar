import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.argv[2] !== '--confirm')
	throw new Error(
		'This disables the admin PIN and revokes sessions. Run with --confirm on the installation host.'
	);
const path = resolve(process.env.DATA_DIR || 'data', 'admin.sqlite');
if (!existsSync(path)) throw new Error('No admin access database exists in DATA_DIR.');
const db = new DatabaseSync(path);
try {
	db.exec(
		'PRAGMA busy_timeout=5000; BEGIN IMMEDIATE; UPDATE access SET hash=NULL,salt=NULL,attempts=0,window=0 WHERE id=1; DELETE FROM sessions; COMMIT;'
	);
} finally {
	db.close();
}
console.log(
	'Admin PIN disabled; sessions revoked. Set a new PIN in /admin/access. Calendar and reminder data were not changed.'
);

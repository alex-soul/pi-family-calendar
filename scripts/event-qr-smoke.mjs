import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
// Read-only Google handoff check. No event/reminder edits or admin credentials.
const origin = process.argv[2] || 'http://127.0.0.1:8775';
const snapshot = await (await fetch(origin + '/api/calendar')).json();
assert.equal(snapshot.source, 'google', 'Connect Google before checking the event handoff');
const event = snapshot.events[0];
assert.ok(event, 'Requires a cached event');
const call = (id, requestOrigin = origin) =>
	fetch(origin + '/api/calendar/event-qr', {
		method: 'POST',
		headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
		body: JSON.stringify({ id })
	});
const response = await call(event.id);
assert.equal(response.status, 200, 'Display QR works without an admin session');
const result = await response.json();
const png = PNG.sync.read(Buffer.from(result.image.split(',')[1], 'base64'));
const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
assert.equal(decoded?.data, result.link, 'QR encodes the exact event URL');
assert.ok(['calendar.google.com', 'www.google.com'].includes(new URL(result.link).hostname));
assert.equal((await call(event.id, 'https://untrusted.invalid')).status, 403);
assert.equal((await call('invalid')).status, 404);
const repeated = await call(event.id);
assert.equal(repeated.status, 200);
assert.equal((await repeated.json()).link, result.link);
console.log(
	'Event QR: decoded URL, repeat access, invalid ID and cross-origin checks passed. No Google writes.'
);

const status = await (await fetch(origin + '/api/qr/status')).json();
const addResponse = await fetch(origin + '/api/calendar/event-qr', {
	method: 'POST',
	headers: { Origin: origin, 'Content-Type': 'application/json' },
	body: JSON.stringify({ action: 'add', date: '2026-10-25' })
});
assert.equal(addResponse.status, status.eventQrEnabled ? 200 : 403);
if (status.eventQrEnabled) {
	const added = await addResponse.json();
	const data = PNG.sync.read(Buffer.from(added.image.split(',')[1], 'base64'));
	assert.equal(jsQR(new Uint8ClampedArray(data.data), data.width, data.height)?.data, added.link);
	const draft = new URL(added.link);
	assert.equal(draft.origin, 'https://calendar.google.com');
	assert.equal(draft.searchParams.get('dates'), '20261025/20261026');
	assert.ok(draft.searchParams.get('src'));
	assert.equal(draft.searchParams.has('authuser'), false);
}
const blocked = await fetch(origin + '/api/admin/event-qr', {
	method: 'POST',
	headers: { Origin: origin, 'Content-Type': 'application/json' },
	body: '{}'
});
assert.ok([400, 401].includes(blocked.status));
console.log(
	'New-event QR: toggle enforcement, decoded date/calendar draft and admin boundary passed.'
);

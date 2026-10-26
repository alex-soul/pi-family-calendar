// Optional fictional UI review, layered over screenshot-preview on loopback.
// Never forwards writes or calls Google. Restart to restore the failed-calendar scenario.
import { createServer, request } from 'node:http';
const stamp = () => new Date().toISOString();
const calendars = ['Demo holidays', 'Demo family'].map((name, i) => ({
	id: `demo-${i}`,
	name,
	lastSuccess: stamp(),
	lastAttempt: stamp(),
	nextAttempt: Date.now() + 120000,
	failures: i === 0 ? 1 : 0,
	error:
		i === 0 ? 'Google request timed out. Retrying automatically; cached events are retained.' : '',
	ranges: [{ from: '2020-01-01', to: '2028-01-01' }],
	historyStart: '2020-01-01',
	backfillAt: 0,
	backfillComplete: true,
	progress: null
}));
let running = false;
const status = () => ({
	configured: true,
	offline: false,
	running,
	activity: running ? 'Rebuilding demo calendar' : '',
	intervalSeconds: 120,
	eventCount: 48,
	sourceCount: 48,
	requestsToday: 12,
	standard: { from: '2026-09-01', to: '2027-11-01' },
	calendars,
	accountErrors: []
});
const json = (res, code, value) => {
	res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
	res.end(JSON.stringify(value));
};
createServer(async (req, res) => {
	if (req.url === '/api/google' && req.method === 'GET') return json(res, 200, { sync: status() });
	if (req.url === '/api/google' && req.method === 'POST') {
		let body = '';
		for await (const part of req) {
			body += part;
			if (body.length > 2048) return json(res, 400, { message: 'Invalid preview request' });
		}
		let input;
		try {
			input = JSON.parse(body);
		} catch {
			return json(res, 400, { message: 'Invalid preview request' });
		}
		if (input.action !== 'sync' || running)
			return json(res, 409, { message: 'Only fictional sync is available here.' });
		const selected = calendars.filter((c) => !input.calendarId || c.id === input.calendarId);
		if (!selected.length) return json(res, 400, { message: 'Choose a demo calendar.' });
		running = true;
		for (let completed = 0; completed < 4; completed++) {
			for (const c of selected) c.progress = { phase: 'Rebuilding calendar', completed, total: 4 };
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
		for (const c of selected) {
			c.progress = null;
			c.error = '';
			c.failures = 0;
			c.lastSuccess = c.lastAttempt = stamp();
			c.nextAttempt = Date.now() + 120000;
		}
		running = false;
		return json(res, 200, { sync: status() });
	}
	if (!['GET', 'HEAD'].includes(req.method))
		return json(res, 403, { message: 'This fictional review does not forward changes.' });
	const upstream = request(
		{
			hostname: '127.0.0.1',
			port: 5174,
			path: req.url,
			method: req.method,
			headers: { ...req.headers, host: '127.0.0.1:5174' }
		},
		(response) => {
			res.writeHead(response.statusCode, response.headers);
			response.pipe(res);
		}
	);
	upstream.on('error', () =>
		json(res, 502, { message: 'Start scripts/screenshot-preview.mjs first.' })
	);
	req.pipe(upstream);
}).listen(5175, '127.0.0.1', () =>
	console.log(
		'Fictional sync UI: http://127.0.0.1:5175/admin/google — no Google requests or forwarded writes.'
	)
);

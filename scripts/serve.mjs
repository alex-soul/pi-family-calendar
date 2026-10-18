import { createServer } from 'node:http';
// This direct HTTP listener owns its protocol header; never trust a client-supplied proxy header.
process.env.PROTOCOL_HEADER = 'x-calendar-protocol';
const { handler } = await import('../build/handler.js');
const server = createServer((req, res) => {
	req.headers['x-calendar-protocol'] = 'http';
	handler(req, res);
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
	process.on(signal, () => {
		if (stopping) return;
		stopping = true;
		process.emit('calendar:quiesce');
		const deadline = setTimeout(() => {
			console.error('Graceful shutdown timed out.');
			process.exit(1);
		}, 30_000);
		server.close(async () => {
			try {
				await Promise.all(process.listeners('calendar:shutdown').map((listener) => listener()));
				clearTimeout(deadline);
				process.exit(0);
			} catch {
				console.error('Service shutdown failed.');
				process.exit(1);
			}
		});
		server.closeIdleConnections();
	});

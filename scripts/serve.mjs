import { createServer } from 'node:http';
// This direct HTTP listener owns its protocol header; never trust a client-supplied proxy header.
process.env.PROTOCOL_HEADER = 'x-calendar-protocol';
const { handler } = await import('../build/handler.js');
const server = createServer((req, res) => {
	req.headers['x-calendar-protocol'] = 'http';
	handler(req, res);
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
	process.on(signal, () => server.close(() => process.exit(0)));

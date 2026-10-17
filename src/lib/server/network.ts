const local = [
	'http://127.0.0.1:8775',
	'http://localhost:8775',
	'http://127.0.0.1:3000',
	'http://localhost:3000',
	'http://127.0.0.1:5173',
	'http://localhost:5173'
];
export function permittedOrigin(
	origin: string,
	host: string | null,
	extra = process.env.LAN_ORIGIN || ''
) {
	const allowed = [
		...local,
		...extra
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean)
	];
	return allowed.includes(origin) && new URL(origin).host === host;
}
export function validatePublicOrigin() {
	const origin = process.env.PUBLIC_BASE_URL;
	if (
		origin &&
		(!permittedOrigin(origin, new URL(origin).host) || new URL(origin).origin !== origin)
	)
		throw new Error('PUBLIC_BASE_URL must match an explicitly allowed origin, without a path.');
}

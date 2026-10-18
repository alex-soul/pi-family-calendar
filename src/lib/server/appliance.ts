import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface DisplaySettings {
	brightness: number;
	autoBlank: boolean;
	idleMinutes: number;
}
export interface DisplayState extends DisplaySettings {
	actualBrightness: number;
	awake: boolean;
	wakeMonitor: boolean;
	sampledAt: number;
}
export interface HostStatus {
	sampledAt: number;
	uptimeSeconds: number | null;
	memory: { total: number; available: number; swapTotal: number; swapUsed: number } | null;
	disk: { total: number; free: number } | null;
	temperatureC: number | null;
	throttleFlags: number | null;
	failedUnits: number | null;
	maintenance: {
		sampledAt: number | null;
		status: string;
		lastSuccess: number | null;
		nextUpdate: number | null;
		nextReboot: number | null;
		pendingReboot: boolean | null;
		bootHealth: string;
	} | null;
	backup: { sampledAt: number | null; status: string; lastSuccess: number | null } | null;
	mqtt: { sampledAt: number | null; connected: boolean | null } | null;
}
export interface ApplianceStatus {
	state: 'ready' | 'unavailable' | 'not-configured';
	host: HostStatus | null;
	display: DisplayState | null;
	powerEnabled: boolean;
}

export class ApplianceError extends Error {
	status: number;
	constructor(message: string, status = 503) {
		super(message);
		this.status = status;
	}
}

/** One request, one bounded response. In particular, never retry power submissions. */
export function socketRequest<T>(path: string, token: string, request: object): Promise<T> {
	return new Promise((resolve, reject) => {
		const socket = connect(path);
		let buffer = '';
		let settled = false;
		const finish = (error?: Error, value?: T) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (error) reject(error);
			else resolve(value!);
		};
		const timer = setTimeout(
			() =>
				finish(
					new ApplianceError('Device response unavailable. Check its status before retrying.')
				),
			7000
		);
		socket.setEncoding('utf8');
		socket.on('connect', () => socket.write(JSON.stringify({ ...request, token }) + '\n'));
		socket.on('error', () => finish(new ApplianceError('Device controller unavailable.')));
		socket.on('end', () =>
			finish(new ApplianceError('Device response unavailable. Check its status before retrying.'))
		);
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			if (buffer.length > 16384) return finish(new ApplianceError('Invalid device response.'));
			if (!buffer.includes('\n')) return;
			try {
				const response = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
				if (response.ok === true && response.data && typeof response.data === 'object')
					finish(undefined, response.data as T);
				else
					finish(
						new ApplianceError(
							typeof response.message === 'string' && response.message.length <= 200
								? response.message
								: 'Device request rejected.',
							409
						)
					);
			} catch {
				finish(new ApplianceError('Invalid device response.'));
			}
		});
	});
}

export async function applianceRequest<T>(request: object): Promise<T> {
	const path = process.env.APPLIANCE_SOCKET;
	const tokenFile = process.env.APPLIANCE_TOKEN_FILE;
	if (!path || !tokenFile) throw new ApplianceError('Device controls are not configured.');
	let token: string;
	try {
		token = readFileSync(tokenFile, 'utf8').trim();
		if (!/^[a-f0-9]{64}$/.test(token)) throw new Error();
	} catch {
		throw new ApplianceError('Device controller unavailable.');
	}
	return socketRequest<T>(path, token, request);
}

let pending: Promise<ApplianceStatus> | undefined;
let last: ApplianceStatus | undefined;
let lastAt = 0;
export function invalidateAppliance() {
	last = undefined;
	lastAt = 0;
}
export async function applianceStatus(): Promise<ApplianceStatus> {
	if (!process.env.APPLIANCE_SOCKET || !process.env.APPLIANCE_TOKEN_FILE)
		return { state: 'not-configured', host: null, display: null, powerEnabled: false };
	if (last && Date.now() - lastAt < 4000) return last;
	if (pending) return pending;
	pending = (async () => {
		try {
			const result = await applianceRequest<Omit<ApplianceStatus, 'state'>>({ kind: 'status' });
			last = { ...result, state: 'ready' };
		} catch {
			last = { state: 'unavailable', host: null, display: null, powerEnabled: false };
		}
		lastAt = Date.now();
		return last;
	})();
	try {
		return await pending;
	} finally {
		pending = undefined;
	}
}

export function powerOwner(admin: { unlocked: boolean; pinEnabled: boolean }, cookie?: string) {
	if (!admin.pinEnabled || !admin.unlocked || !cookie || !/^[a-f0-9]{64}$/.test(cookie))
		throw new ApplianceError('Enable a PIN and unlock admin to use power controls.', 403);
	return createHash('sha256').update(cookie).digest('hex');
}

export function displayRequest(input: unknown): object {
	if (!input || typeof input !== 'object')
		throw new ApplianceError('Choose a display action.', 400);
	const value = input as Record<string, unknown>;
	if (['sleep', 'wake'].includes(String(value.action)) && Object.keys(value).length === 1)
		return value;
	if (
		value.action === 'settings' &&
		Object.keys(value).length === 2 &&
		value.settings &&
		typeof value.settings === 'object'
	) {
		const settings = value.settings as Record<string, unknown>;
		if (
			Object.keys(settings).length === 3 &&
			typeof settings.autoBlank === 'boolean' &&
			Number.isInteger(settings.brightness) &&
			Number(settings.brightness) >= 10 &&
			Number(settings.brightness) <= 100 &&
			Number.isInteger(settings.idleMinutes) &&
			Number(settings.idleMinutes) >= 1 &&
			Number(settings.idleMinutes) <= 120
		)
			return {
				action: 'settings',
				settings: {
					brightness: settings.brightness,
					autoBlank: settings.autoBlank,
					idleMinutes: settings.idleMinutes
				}
			};
	}
	throw new ApplianceError('Check the display settings.', 400);
}

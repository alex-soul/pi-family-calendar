export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(url, {
		...options,
		headers: { 'Content-Type': 'application/json', ...options.headers }
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.message || `Request failed (${response.status}).`);
	}
	return response.status === 204 ? (undefined as T) : response.json();
}

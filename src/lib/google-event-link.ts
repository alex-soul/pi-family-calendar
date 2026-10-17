/** Only Google's event UI, never a general redirect or an arbitrary provider URL. */
export function googleEventLink(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length > 4096) return;
	try {
		const url = new URL(value);
		if (
			url.protocol !== 'https:' ||
			!['calendar.google.com', 'www.google.com'].includes(url.hostname) ||
			url.port ||
			url.username ||
			url.password ||
			!/^\/calendar\/(?:event|(?:u\/\d+\/)?r\/eventedit)(?:\/[^/]*)?$/.test(url.pathname)
		)
			return;
		return url.href;
	} catch {
		return;
	}
}

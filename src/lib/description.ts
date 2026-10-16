import { decodeHTML } from 'entities';

/** Display-only text extraction, never an HTML sanitizer or HTML rendering path. */
export function plainDescription(value: string | undefined): string {
	if (!value) return '';
	// Retain plain text and comparison signs; only recognize actual tag-shaped content.
	const text = value
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
		.replace(
			/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
			(_all, _quote, url: string, label: string) => {
				const words = label.replace(/<[^>]+>/g, '');
				return /^https?:\/\//i.test(url) && decodeHTML(words).trim() !== decodeHTML(url)
					? `${words} (${url})`
					: words;
			}
		)
		.replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|br|tr)\b[^>]*>/gi, '\n')
		.replace(/<\/?[a-z][a-z0-9:-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/gi, '');
	return decodeHTML(text)
		.replace(/\u00a0/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

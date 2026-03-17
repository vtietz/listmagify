// Vitest setup: extend expect with jest-dom matchers for @testing-library
import '@testing-library/jest-dom/vitest';

const allowedTestHosts = new Set(['localhost', '127.0.0.1', '::1', 'spotify-mock']);
const originalFetch = globalThis.fetch?.bind(globalThis);

if (originalFetch) {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const rawUrl =
			typeof input === 'string'
				? input
				: input instanceof URL
				? input.toString()
				: input.url;

		let hostname: string | null = null;
		let protocol: string | null = null;

		try {
			const parsed = new URL(rawUrl, 'http://localhost');
			hostname = parsed.hostname;
			protocol = parsed.protocol;
		} catch {
			hostname = null;
			protocol = null;
		}

		const isHttpRequest = protocol === 'http:' || protocol === 'https:';
		if (isHttpRequest && hostname && !allowedTestHosts.has(hostname)) {
			throw new Error(`[tests] External HTTP(S) call blocked in unit tests: ${rawUrl}`);
		}

		return originalFetch(input, init);
	}) as typeof fetch;
}
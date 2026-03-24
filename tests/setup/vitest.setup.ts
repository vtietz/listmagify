// Vitest setup: extend expect with jest-dom matchers for @testing-library
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import React from 'react';

// Mock next/image with a plain <img> element to avoid remotePatterns validation in unit tests.
// Components use next/image for optimization but tests only care about rendered output.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    fill: _fill,
    sizes: _sizes,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    priority?: boolean;
    unoptimized?: boolean;
    [key: string]: unknown;
  }) => React.createElement('img', { src, alt, ...props }),
}));

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
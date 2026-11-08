import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();

vi.mock('@/lib/errors/store', () => ({
  reportError: (error: unknown) => reportError(error),
  useErrorStore: { getState: () => ({ openDialog: vi.fn() }) },
}));

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  isPerPanelInlineLoginEnabled: () => false,
}));

import { apiFetch, ApiError } from '@/lib/api/client';

function mockFetchResponse(status: number, body: string, contentType: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })));
}

describe('apiFetch error report context', () => {
  beforeEach(() => {
    reportError.mockClear();
    window.localStorage.setItem('music-provider-id', 'spotify');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('marks a non-JSON 504 as coming from the proxy and records the request provider', async () => {
    mockFetchResponse(504, '<html>504 Gateway Time-out</html>', 'text/html');

    await expect(
      apiFetch('/api/me/playlists?provider=tidal', { suppressErrorDialog: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(reportError).toHaveBeenCalledTimes(1);
    const reported = reportError.mock.calls[0]?.[0];
    expect(reported.statusCode).toBe(504);
    expect(reported.requestPath).toBe('/api/me/playlists');
    expect(reported.context).toEqual({ provider: 'tidal', method: 'GET', responseSource: 'proxy' });
  });

  it('marks a JSON error as coming from the app and falls back to the active provider', async () => {
    mockFetchResponse(500, JSON.stringify({ error: 'boom' }), 'application/json');

    await expect(
      apiFetch('/api/sync/run', { method: 'post', suppressErrorDialog: true }),
    ).rejects.toBeInstanceOf(ApiError);

    const reported = reportError.mock.calls[0]?.[0];
    expect(reported.message).toBe('boom');
    expect(reported.context).toEqual({ provider: 'spotify', method: 'POST', responseSource: 'app' });
  });
});

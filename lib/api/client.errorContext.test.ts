import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();
const openDialog = vi.fn();

vi.mock('@/lib/errors/store', () => ({
  reportError: (error: unknown) => reportError(error),
  useErrorStore: { getState: () => ({ openDialog }) },
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
    openDialog.mockClear();
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
    expect(reported.context).toEqual({ provider: 'tidal', method: 'GET', responseSource: 'proxy', kind: 'gateway_timeout' });
    expect(reported.message).toBe('The request took too long');
    expect(reported.severity).toBe('warning');
  });

  it('marks a JSON error as coming from the app and falls back to the active provider', async () => {
    mockFetchResponse(500, JSON.stringify({ error: 'boom' }), 'application/json');

    await expect(
      apiFetch('/api/sync/run', { method: 'post', suppressErrorDialog: true }),
    ).rejects.toBeInstanceOf(ApiError);

    const reported = reportError.mock.calls[0]?.[0];
    expect(reported.message).toBe('boom');
    expect(reported.context).toEqual({ provider: 'spotify', method: 'POST', responseSource: 'app', kind: 'server_error' });
    expect(reported.hint).toBeUndefined();
  });

  it('shows a provider outage (503 payload) as a hint without opening the report dialog', async () => {
    mockFetchResponse(503, JSON.stringify({
      authError: true,
      provider: 'spotify',
      code: 'provider_unavailable',
      message: 'Get playlist tracks failed: 503',
    }), 'application/json');

    await expect(apiFetch('/api/playlists/abc/tracks')).rejects.toBeInstanceOf(ApiError);

    const reported = reportError.mock.calls[0]?.[0];
    expect(reported.message).toBe('Spotify is temporarily unavailable');
    expect(reported.details).toBe('Get playlist tracks failed: 503');
    expect(reported.hint).toContain('try again');
    expect(reported.severity).toBe('warning');
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('still opens the report dialog for unexplained server errors', async () => {
    mockFetchResponse(500, JSON.stringify({ error: 'boom' }), 'application/json');

    await expect(apiFetch('/api/playlists/abc/tracks')).rejects.toBeInstanceOf(ApiError);

    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it('labels 429 rate limits with the request provider and suggests BYOK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'slow down' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': '30' },
    })));

    await expect(apiFetch('/api/me/playlists?provider=tidal')).rejects.toThrow();

    const reported = reportError.mock.calls[0]?.[0];
    expect(reported.category).toBe('rate_limit');
    expect(reported.message).toContain('TIDAL rate limit reached');
    expect(reported.suggestByok).toBe(true);
  });
});

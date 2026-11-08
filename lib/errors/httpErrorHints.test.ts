import { describe, expect, it } from 'vitest';
import { describeHttpError } from '@/lib/errors/httpErrorHints';

const base = { providerName: 'Spotify', responseSource: 'app' as const };

describe('describeHttpError', () => {
  it('treats 429 as a transient rate limit and suggests BYOK', () => {
    const result = describeHttpError({ ...base, status: 429 });
    expect(result.kind).toBe('rate_limited');
    expect(result.transient).toBe(true);
    expect(result.suggestByok).toBe(true);
    expect(result.title).toContain('Spotify');
  });

  it('treats a 503 provider_unavailable payload as a provider outage without BYOK', () => {
    const result = describeHttpError({ ...base, status: 503, code: 'provider_unavailable' });
    expect(result.kind).toBe('provider_unavailable');
    expect(result.transient).toBe(true);
    expect(result.suggestByok).toBe(false);
    expect(result.hint).toBeDefined();
  });

  it('treats a non-JSON 504 from the proxy as a gateway timeout', () => {
    const result = describeHttpError({ ...base, status: 504, responseSource: 'proxy' });
    expect(result.kind).toBe('gateway_timeout');
    expect(result.transient).toBe(true);
  });

  it('keeps unexplained 500s as hard errors without a hint', () => {
    const result = describeHttpError({ ...base, status: 500 });
    expect(result.kind).toBe('server_error');
    expect(result.transient).toBe(false);
    expect(result.hint).toBeUndefined();
  });

  it('keeps 4xx errors without a hint', () => {
    const result = describeHttpError({ ...base, status: 404 });
    expect(result.kind).toBe('client_error');
    expect(result.hint).toBeUndefined();
  });
});

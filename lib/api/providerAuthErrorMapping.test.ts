import { describe, expect, it } from 'vitest';
import { ProviderApiError } from '@/lib/music-provider/types';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import { routeErrors } from '@/lib/errors';
import { mapApiErrorToProviderAuthError } from '@/lib/api/errorHandler';

describe('mapApiErrorToProviderAuthError', () => {
  it('maps ServerAuthError token_expired to expired code', () => {
    const mapped = mapApiErrorToProviderAuthError(
      new ServerAuthError('Session token expired', 'token_expired'),
      'spotify',
    );

    expect(mapped).not.toBeNull();
    expect(mapped?.provider).toBe('spotify');
    expect(mapped?.code).toBe('expired');
  });

  it('maps ProviderApiError 401 refresh_failed to expired', () => {
    const mapped = mapApiErrorToProviderAuthError(
      new ProviderApiError('Authentication required', 401, 'tidal', 'refresh_failed'),
    );

    expect(mapped).not.toBeNull();
    expect(mapped?.provider).toBe('tidal');
    expect(mapped?.code).toBe('expired');
  });

  it('maps ProviderApiError 429 to rate_limited with parsed retryAfter', () => {
    const mapped = mapApiErrorToProviderAuthError(
      new ProviderApiError('Rate limited', 429, 'spotify', 'retryAfter=3'),
    );

    expect(mapped).not.toBeNull();
    expect(mapped?.code).toBe('rate_limited');
    expect(mapped?.retryAfterMs).toBe(3000);
  });

  it('maps AppRouteError 401 to unauthenticated for provider hint', () => {
    const mapped = mapApiErrorToProviderAuthError(
      routeErrors.unauthorized('token_expired'),
      'tidal',
    );

    expect(mapped).not.toBeNull();
    expect(mapped?.provider).toBe('tidal');
    expect(mapped?.code).toBe('unauthenticated');
  });
});

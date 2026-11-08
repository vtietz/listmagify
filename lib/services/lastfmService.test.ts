import { describe, expect, it } from 'vitest';
import { isAppRouteError } from '@/lib/errors';
import { LastfmApiError } from '@/lib/importers/lastfm';
import { mapLastfmError } from '@/lib/services/lastfmService';

function catchMapped(error: unknown) {
  try {
    mapLastfmError(error);
  } catch (mapped) {
    return mapped;
  }
  throw new Error('mapLastfmError did not throw');
}

describe('mapLastfmError', () => {
  it('maps an unknown Last.fm user to 404', () => {
    const mapped = catchMapped(new LastfmApiError('Last.fm API error: User not found', 6, 404));
    expect(isAppRouteError(mapped) && mapped.status).toBe(404);
    expect((mapped as Error).message).toContain('Last.fm user not found');
  });

  it('maps Last.fm error 29 to 429', () => {
    const mapped = catchMapped(new LastfmApiError('Last.fm API error: Rate Limit Exceded', 29, 200));
    expect(isAppRouteError(mapped) && mapped.status).toBe(429);
  });

  it('keeps other invalid-parameter errors as upstream failures', () => {
    const mapped = catchMapped(new LastfmApiError('Last.fm API error: Invalid method', 6, 400));
    expect(isAppRouteError(mapped) && mapped.status).toBe(502);
  });

  it('maps unknown errors to upstream failures', () => {
    const mapped = catchMapped(new Error('socket hang up'));
    expect(isAppRouteError(mapped) && mapped.status).toBe(502);
  });
});

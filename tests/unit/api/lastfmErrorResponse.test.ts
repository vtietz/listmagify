import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { routeErrors } from '@/lib/errors';
import { LastfmApiError } from '@/lib/importers/lastfm';
import { lastfmErrorResponse } from '@/app/api/lastfm/_shared/errorResponse';

const url = new URL('http://localhost/api/lastfm/recent?user=nobody');
const request = { url: url.toString(), nextUrl: url, headers: new Headers() } as unknown as NextRequest;

describe('lastfmErrorResponse', () => {
  it('returns 404 with a readable message for an unknown Last.fm user', async () => {
    const response = lastfmErrorResponse(
      new LastfmApiError('Last.fm API error: User not found', 6, 404),
      request,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Last.fm user not found. Check the username spelling.',
      retryable: false,
    });
  });

  it('returns 429 as retryable for Last.fm rate limits', async () => {
    const response = lastfmErrorResponse(new LastfmApiError('Rate Limit Exceded', 29, 200), request);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ retryable: true });
  });

  it('returns 503 when Last.fm import is disabled', async () => {
    const response = lastfmErrorResponse(routeErrors.featureDisabled('off'), request);
    expect(response.status).toBe(503);
  });

  it('returns 500 for unexpected Last.fm failures', async () => {
    const response = lastfmErrorResponse(new Error('socket hang up'), request);
    expect(response.status).toBe(500);
  });
});

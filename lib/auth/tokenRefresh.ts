/**
 * Token refresh logic extracted from auth.ts.
 *
 * All functions that deal with refreshing provider access tokens live here so
 * they can be reused by both the NextAuth JWT callback (auth.ts) and the
 * DB-backed session reconstruction (sessionFromDb.ts).
 */

import { serverEnv } from '@/lib/env';
import { TIDAL_TOKEN_URL } from '@/lib/auth/authProviderFactories';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { isRefreshBlocked, recordPermanentFailure } from '@/lib/auth/refreshCircuitBreaker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TOKEN_REFRESH_ERROR = 'RefreshAccessTokenError';
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderJwtToken = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  isByok?: boolean;
  byok?: {
    clientId?: string;
    clientSecret?: string;
  };
  error?: string;
};

export type ProviderTokenStore = Partial<Record<MusicProviderId, ProviderJwtToken>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function shouldRefreshProviderToken(token: ProviderJwtToken): boolean {
  if (!token.accessTokenExpires) {
    return false;
  }

  return Date.now() >= token.accessTokenExpires - REFRESH_BUFFER_MS;
}

export type ClientCredentials = { clientId: string; clientSecret: string };

/**
 * Thrown when a BYOK token has no usable BYOK credentials. Refresh tokens are
 * bound to the app that issued them, so falling back to the server app would
 * only fail with `invalid_client`. Thrown rather than returned as an error
 * token so callers can tell it apart from a provider-side `invalid_grant`.
 */
export class MissingByokCredentialsError extends Error {
  constructor(providerId: MusicProviderId) {
    super(`Missing BYOK client credentials for ${providerId} token refresh`);
    this.name = 'MissingByokCredentialsError';
  }
}

function nonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Picks the client credentials a refresh token must be refreshed with:
 * the user's own app for BYOK tokens (no fallback), the server app otherwise.
 * Empty strings count as missing.
 */
export function resolveClientCredentials(
  providerId: MusicProviderId,
  token: ProviderJwtToken,
  serverCredentials: { clientId: string | undefined; clientSecret: string | undefined },
): ClientCredentials {
  const byokId = token.byok?.clientId;
  const byokSecret = token.byok?.clientSecret;
  const hasByokCredentials = nonEmpty(byokId) && nonEmpty(byokSecret);

  if (token.isByok && !hasByokCredentials) {
    throw new MissingByokCredentialsError(providerId);
  }

  if (hasByokCredentials) {
    return { clientId: byokId, clientSecret: byokSecret };
  }

  const { clientId, clientSecret } = serverCredentials;
  if (!nonEmpty(clientId) || !nonEmpty(clientSecret)) {
    throw new Error(`${providerId} client credentials are not configured`);
  }

  return { clientId, clientSecret };
}

export function resolveSpotifyClientCredentials(token: ProviderJwtToken): ClientCredentials {
  return resolveClientCredentials('spotify', token, {
    clientId: serverEnv.SPOTIFY_CLIENT_ID,
    clientSecret: serverEnv.SPOTIFY_CLIENT_SECRET,
  });
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

export function buildRefreshedSpotifyToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const refreshToken = data.refresh_token ?? token.refreshToken;
  const refreshedToken: ProviderJwtToken = {
    ...token,
    accessToken: data.access_token,
    accessTokenExpires: Date.now() + expiresInMs,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
    ...(token.isByok ? { isByok: true } : {}),
    ...(token.byok ? { byok: token.byok } : {}),
  };

  delete refreshedToken.error;
  return refreshedToken;
}

export async function refreshSpotifyAccessToken(token: ProviderJwtToken): Promise<ProviderJwtToken> {
  // Resolved outside the try: missing BYOK credentials are not transient and
  // must propagate (same as TIDAL) instead of being retried forever.
  const { clientId, clientSecret } = resolveSpotifyClientCredentials(token);

  try {
    if (!token.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      // Permanent failure: refresh token is revoked or otherwise invalid
      if (data.error === 'invalid_grant') {
        console.debug(`[auth] Refresh token permanently invalid: ${data.error_description ?? 'invalid_grant'}`);
        return { ...token, error: TOKEN_REFRESH_ERROR };
      }

      // Transient failure: server error, rate limit, etc. — don't set error so
      // the next JWT callback will retry the refresh automatically.
      console.warn(
        `[auth] Transient token refresh failure: ${res.status} ${res.statusText}`,
        data
      );
      return token;
    }

    return buildRefreshedSpotifyToken(token, data);
  } catch (error) {
    // Network errors (DNS, timeout, etc.) are transient — return token unchanged
    // so the next JWT callback retries instead of permanently killing the session.
    console.warn("[auth] refreshSpotifyAccessToken transient error (will retry)", error);
    return token;
  }
}

// ---------------------------------------------------------------------------
// TIDAL
// ---------------------------------------------------------------------------

export function resolveTidalClientCredentials(token: ProviderJwtToken): ClientCredentials {
  return resolveClientCredentials('tidal', token, {
    clientId: serverEnv.TIDAL_CLIENT_ID,
    clientSecret: serverEnv.TIDAL_CLIENT_SECRET,
  });
}

export function buildRefreshedTidalToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const refreshToken = data.refresh_token ?? token.refreshToken;
  const rotated = typeof data.refresh_token === 'string' && data.refresh_token !== token.refreshToken;
  console.debug(
    `[auth] TIDAL refresh result: expires_in=${data.expires_in ?? 'missing'}s, refresh_token_rotated=${rotated}`,
  );
  const refreshedToken: ProviderJwtToken = {
    ...token,
    accessToken: data.access_token,
    accessTokenExpires: Date.now() + expiresInMs,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
    ...(token.isByok ? { isByok: true as const } : {}),
    ...(token.byok ? { byok: token.byok } : {}),
  };

  delete refreshedToken.error;
  return refreshedToken;
}

export async function refreshTidalAccessToken(token: ProviderJwtToken): Promise<ProviderJwtToken> {
  if (!token.refreshToken) {
    throw new Error('Missing refresh token');
  }

  const { clientId, clientSecret } = resolveTidalClientCredentials(token);

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const response = await fetch(TIDAL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      // Permanent failure: refresh token invalid
      if (data.error === 'invalid_grant') {
        console.debug(`[auth] TIDAL refresh token permanently invalid: ${data.error_description ?? 'invalid_grant'}`);
        return { ...token, error: TOKEN_REFRESH_ERROR };
      }

      // Transient failure — return token unchanged so next callback retries
      console.warn(
        `[auth] Transient TIDAL token refresh failure: ${response.status} ${response.statusText}`,
        data
      );
      return token;
    }

    return buildRefreshedTidalToken(token, data);
  } catch (error) {
    // Network errors are transient — return unchanged so next callback retries
    console.warn('[auth] refreshTidalAccessToken transient error (will retry)', error);
    return token;
  }
}

// ---------------------------------------------------------------------------
// Provider-agnostic dispatch
// ---------------------------------------------------------------------------

export async function refreshProviderAccessToken(
  providerId: MusicProviderId,
  token: ProviderJwtToken
): Promise<ProviderJwtToken> {
  const refreshers: Record<MusicProviderId, (providerToken: ProviderJwtToken) => Promise<ProviderJwtToken>> = {
    spotify: refreshSpotifyAccessToken,
    tidal: refreshTidalAccessToken,
  };

  return refreshers[providerId](token);
}

export async function refreshProviderTokenIfNeeded(
  providerId: MusicProviderId,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
  userId?: string,
): Promise<void> {
  const providerToken = providerTokens[providerId];
  if (!providerToken?.accessToken) {
    return;
  }

  if (providerToken.error === TOKEN_REFRESH_ERROR) {
    providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    return;
  }

  if (isRefreshBlocked(providerId, userId)) {
    providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    return;
  }

  if (!shouldRefreshProviderToken(providerToken)) {
    providerErrors[providerId] = providerErrors[providerId] ?? undefined;
    return;
  }

  if (!providerToken.refreshToken) {
    providerTokens[providerId] = {
      ...providerToken,
      error: TOKEN_REFRESH_ERROR,
    };
    providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    return;
  }

  try {
    console.debug(`[auth] ${providerId} token expiring soon or expired, refreshing...`);
    const refreshedToken = await refreshProviderAccessToken(providerId, providerToken);
    providerTokens[providerId] = refreshedToken;

    // Provider functions return an error token for permanent failures,
    // or the unchanged token for transient failures (no error flag).
    if (refreshedToken.error === TOKEN_REFRESH_ERROR) {
      recordPermanentFailure(providerId, userId, 'invalid_grant');
      providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    } else {
      providerErrors[providerId] = undefined;
    }
  } catch (error) {
    if (error instanceof MissingByokCredentialsError) {
      // Permanent until re-auth; the token's error flag already stops retries,
      // and no request to the provider was made, so the breaker stays out of it.
      providerTokens[providerId] = { ...providerToken, error: TOKEN_REFRESH_ERROR };
      providerErrors[providerId] = TOKEN_REFRESH_ERROR;
      console.warn(`[auth] ${error.message}; re-authentication required`);
      return;
    }
    // Unexpected throw — treat as transient; leave token unchanged so next
    // JWT callback retries instead of permanently killing the session.
    console.warn(`[auth] Failed to refresh ${providerId} token (will retry)`, error);
  }
}

/**
 * @param resolveUserId maps a provider to the user ID the circuit breaker is
 *   keyed by; without it (or when it returns undefined) the breaker is skipped.
 */
export async function refreshProviderTokens(
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
  resolveUserId?: (providerId: MusicProviderId) => string | undefined,
): Promise<void> {
  for (const providerId of Object.keys(providerTokens) as MusicProviderId[]) {
    await refreshProviderTokenIfNeeded(providerId, providerTokens, providerErrors, resolveUserId?.(providerId));
  }
}

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

export function resolveSpotifyClientCredentials(token: ProviderJwtToken): { clientId: string; clientSecret: string } {
  const clientId = token.byok?.clientId || serverEnv.SPOTIFY_CLIENT_ID;
  const clientSecret = token.byok?.clientSecret || serverEnv.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify client credentials are not configured');
  }

  return {
    clientId,
    clientSecret,
  };
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
  try {
    if (!token.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const { clientId, clientSecret } = resolveSpotifyClientCredentials(token);

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
  };

  delete refreshedToken.error;
  return refreshedToken;
}

export async function refreshTidalAccessToken(token: ProviderJwtToken): Promise<ProviderJwtToken> {
  if (!token.refreshToken) {
    throw new Error('Missing refresh token');
  }

  if (!serverEnv.TIDAL_CLIENT_ID || !serverEnv.TIDAL_CLIENT_SECRET) {
    throw new Error('TIDAL client credentials are not configured');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refreshToken,
    client_id: serverEnv.TIDAL_CLIENT_ID,
    client_secret: serverEnv.TIDAL_CLIENT_SECRET,
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
): Promise<void> {
  const providerToken = providerTokens[providerId];
  if (!providerToken?.accessToken) {
    return;
  }

  if (providerToken.error === TOKEN_REFRESH_ERROR) {
    providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    return;
  }

  if (isRefreshBlocked(providerId)) {
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
      recordPermanentFailure(providerId, 'invalid_grant');
      providerErrors[providerId] = TOKEN_REFRESH_ERROR;
    } else {
      providerErrors[providerId] = undefined;
    }
  } catch (error) {
    // Unexpected throw — treat as transient; leave token unchanged so next
    // JWT callback retries instead of permanently killing the session.
    console.warn(`[auth] Failed to refresh ${providerId} token (will retry)`, error);
  }
}

export async function refreshProviderTokens(
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): Promise<void> {
  for (const providerId of Object.keys(providerTokens) as MusicProviderId[]) {
    await refreshProviderTokenIfNeeded(providerId, providerTokens, providerErrors);
  }
}

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
      if (data.error === 'invalid_grant' && data.error_description?.includes('revoked')) {
        console.debug('[auth] Refresh token revoked by user (expected) - session will expire');
      } else {
        console.error(
          `[auth] Failed to refresh token: ${res.status} ${res.statusText}`,
          data
        );
      }
      throw new Error(
        `Failed to refresh token: ${res.status} ${res.statusText} ${JSON.stringify(data)}`
      );
    }

    return buildRefreshedSpotifyToken(token, data);
  } catch (error) {
    if (error instanceof Error && error.message.includes('revoked')) {
      return { ...token, error: TOKEN_REFRESH_ERROR };
    }
    console.warn("[auth] refreshSpotifyAccessToken error", error);
    return { ...token, error: TOKEN_REFRESH_ERROR };
  }
}

// ---------------------------------------------------------------------------
// TIDAL
// ---------------------------------------------------------------------------

export function buildRefreshedTidalToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const refreshToken = data.refresh_token ?? token.refreshToken;
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

  const response = await fetch(TIDAL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to refresh TIDAL token: ${response.status} ${response.statusText} ${JSON.stringify(data)}`
    );
  }

  return buildRefreshedTidalToken(token, data);
}

// ---------------------------------------------------------------------------
// Provider-agnostic dispatch
// ---------------------------------------------------------------------------

export async function refreshProviderAccessToken(
  providerId: MusicProviderId,
  token: ProviderJwtToken
): Promise<ProviderJwtToken> {
  if (providerId === 'spotify') {
    return refreshSpotifyAccessToken(token);
  }

  return refreshTidalAccessToken(token);
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
    providerErrors[providerId] = undefined;
  } catch (error) {
    console.warn(`[auth] Failed to refresh ${providerId} token`, error);
    providerTokens[providerId] = {
      ...providerToken,
      error: TOKEN_REFRESH_ERROR,
    };
    providerErrors[providerId] = TOKEN_REFRESH_ERROR;
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

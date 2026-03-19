import SpotifyProvider from "next-auth/providers/spotify";
import type { AuthOptions } from "next-auth";
import { serverEnv } from "@/lib/env";
import { getFallbackMusicProviderId, isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { authLogger, createAuthEvents } from '@/lib/auth/authLogging';

const TOKEN_REFRESH_ERROR = 'RefreshAccessTokenError';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const FALLBACK_PROVIDER_ID = getFallbackMusicProviderId();
const TIDAL_AUTHORIZATION_URL = 'https://login.tidal.com/authorize';
const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
const TIDAL_USERINFO_URL = 'https://openapi.tidal.com/v2/users/me';
const TIDAL_SCOPES = 'r_usr w_usr user.read playlists.read playlists.write collection.read collection.write search.read';

type ProviderJwtToken = {
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

type ProviderTokenStore = Partial<Record<MusicProviderId, ProviderJwtToken>>;

type AuthJwtToken = Record<string, any> & {
  musicProviderTokens?: ProviderTokenStore;
  providerErrors?: Partial<Record<MusicProviderId, string | undefined>>;
};

function toMusicProviderId(value: unknown): MusicProviderId | null {
  if (value === 'spotify' || value === 'tidal') {
    return value;
  }

  return null;
}

function getProviderTokens(token: AuthJwtToken): ProviderTokenStore {
  const fromToken = token.musicProviderTokens ?? {};
  const spotifyToken = fromToken.spotify ?? {};
  const hasLegacySpotifyToken =
    typeof token.accessToken === 'string' ||
    typeof token.refreshToken === 'string' ||
    typeof token.accessTokenExpires === 'number';

  const mergedSpotifyToken: ProviderJwtToken = hasLegacySpotifyToken
    ? {
        ...spotifyToken,
        ...(typeof token.accessToken === 'string' ? { accessToken: token.accessToken } : {}),
        ...(typeof token.refreshToken === 'string' ? { refreshToken: token.refreshToken } : {}),
        ...(typeof token.accessTokenExpires === 'number' ? { accessTokenExpires: token.accessTokenExpires } : {}),
        ...(token.isByok ? { isByok: true } : {}),
        ...(token.byok ? { byok: token.byok } : {}),
      }
    : spotifyToken;

  const providerTokens: ProviderTokenStore = {
    ...fromToken,
  };

  if (Object.keys(mergedSpotifyToken).length > 0) {
    providerTokens.spotify = mergedSpotifyToken;
  }

  return providerTokens;
}

function resolveSessionProviderId(providerTokens: ProviderTokenStore): MusicProviderId | null {
  if (providerTokens[FALLBACK_PROVIDER_ID]?.accessToken) {
    return FALLBACK_PROVIDER_ID;
  }

  if (providerTokens.spotify?.accessToken) {
    return 'spotify';
  }

  if (providerTokens.tidal?.accessToken) {
    return 'tidal';
  }

  return null;
}

function extractExpiresAt(accountData: Record<string, any>): number {
  const rawExpiresAt = accountData.expires_at;
  const rawExpiresIn = accountData.expires_in;

  if (typeof rawExpiresAt === 'number' && Number.isFinite(rawExpiresAt) && rawExpiresAt > 0) {
    if (rawExpiresAt > 10_000_000_000) {
      return rawExpiresAt;
    }

    if (rawExpiresAt > 1_000_000_000) {
      return rawExpiresAt * 1000;
    }

    return Date.now() + rawExpiresAt * 1000;
  }

  if (typeof rawExpiresIn === 'number' && Number.isFinite(rawExpiresIn) && rawExpiresIn > 0) {
    return Date.now() + rawExpiresIn * 1000;
  }

  return Date.now() + 3600 * 1000;
}

function resolveSpotifyClientCredentials(token: ProviderJwtToken): { clientId: string; clientSecret: string } {
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

function createSpotifyAuthProvider() {
  if (!serverEnv.SPOTIFY_CLIENT_ID || !serverEnv.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify provider enabled but SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET are missing');
  }

  return SpotifyProvider({
    clientId: serverEnv.SPOTIFY_CLIENT_ID,
    clientSecret: serverEnv.SPOTIFY_CLIENT_SECRET,
    authorization: {
      params: {
        scope: "user-read-email user-read-private playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify user-read-playback-state user-modify-playback-state streaming",
      },
    },
    checks: ["pkce", "state"],
  });
}

function createTidalAuthProvider() {
  if (!serverEnv.TIDAL_CLIENT_ID || !serverEnv.TIDAL_CLIENT_SECRET) {
    throw new Error('TIDAL provider enabled but TIDAL_CLIENT_ID/TIDAL_CLIENT_SECRET are missing');
  }

  return {
    id: 'tidal',
    name: 'TIDAL',
    type: 'oauth',
    clientId: serverEnv.TIDAL_CLIENT_ID,
    clientSecret: serverEnv.TIDAL_CLIENT_SECRET,
    authorization: {
      url: TIDAL_AUTHORIZATION_URL,
      params: {
        scope: TIDAL_SCOPES,
      },
    },
    token: {
      url: TIDAL_TOKEN_URL,
    },
    userinfo: {
      url: TIDAL_USERINFO_URL,
    },
    checks: ['pkce', 'state'],
    profile(profile: any) {
      return mapTidalProfile(profile);
    },
  } as any;
}

function toTidalProfileData(profile: any): Record<string, any> {
  if (profile && typeof profile === 'object' && profile.data) {
    return profile.data as Record<string, any>;
  }

  return (profile ?? {}) as Record<string, any>;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getTidalDisplayName(username: string | null, email: string | null): string {
  if (username) {
    return username;
  }

  if (email) {
    return email;
  }

  return 'TIDAL User';
}

function mapTidalProfile(profile: any): { id: string; name: string; email: string | null; image: null } {
  const rawData = toTidalProfileData(profile);
  const attributes = (rawData.attributes ?? {}) as Record<string, unknown>;
  const id = String(rawData.id ?? '');
  const email = toOptionalString(attributes.email);
  const username = toOptionalString(attributes.username);

  return {
    id,
    name: getTidalDisplayName(username, email),
    email,
    image: null,
  };
}

const authProviders = [
  ...(isMusicProviderEnabled('spotify') ? [createSpotifyAuthProvider()] : []),
  ...(isMusicProviderEnabled('tidal') ? [createTidalAuthProvider()] : []),
];
function buildRefreshedSpotifyToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
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
async function refreshSpotifyAccessToken(token: ProviderJwtToken): Promise<ProviderJwtToken> {
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

function buildRefreshedTidalToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
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

async function refreshTidalAccessToken(token: ProviderJwtToken): Promise<ProviderJwtToken> {
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

async function refreshProviderAccessToken(
  providerId: MusicProviderId,
  token: ProviderJwtToken
): Promise<ProviderJwtToken> {
  if (providerId === 'spotify') {
    return refreshSpotifyAccessToken(token);
  }

  return refreshTidalAccessToken(token);
}

function shouldRefreshProviderToken(token: ProviderJwtToken): boolean {
  if (!token.accessTokenExpires) {
    return false;
  }

  return Date.now() >= token.accessTokenExpires - REFRESH_BUFFER_MS;
}

function getInitialProviderErrors(nextToken: AuthJwtToken): Partial<Record<MusicProviderId, string | undefined>> {
  return {
    ...(nextToken.providerErrors ?? {}),
  };
}

function buildProviderTokenFromAccount(
  nextToken: AuthJwtToken,
  previousToken: ProviderJwtToken,
  accountData: Record<string, any>,
  providerId: MusicProviderId,
): ProviderJwtToken {
  const expiresAt = extractExpiresAt(accountData);

  if (providerId !== 'spotify') {
    const nextProviderToken: ProviderJwtToken = {
      ...previousToken,
      accessToken: accountData.access_token,
      refreshToken: accountData.refresh_token ?? previousToken.refreshToken,
      accessTokenExpires: expiresAt,
    };

    delete nextProviderToken.error;
    return nextProviderToken;
  }

  const byok = nextToken.byok ?? previousToken.byok;

  const nextProviderToken: ProviderJwtToken = {
    ...previousToken,
    accessToken: accountData.access_token,
    refreshToken: accountData.refresh_token ?? previousToken.refreshToken,
    accessTokenExpires: expiresAt,
    isByok: Boolean(nextToken.isByok ?? previousToken.isByok),
    ...(byok ? { byok } : {}),
  };

  delete nextProviderToken.error;
  return nextProviderToken;
}

function applyAccountToken(
  nextToken: AuthJwtToken,
  account: unknown,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): void {
  if (!account) {
    return;
  }

  const accountData = account as Record<string, any>;
  const providerId = toMusicProviderId(accountData.provider);
  if (!providerId) {
    return;
  }

  const previousToken = providerTokens[providerId] ?? {};
  providerTokens[providerId] = buildProviderTokenFromAccount(nextToken, previousToken, accountData, providerId);
  providerErrors[providerId] = undefined;
}

function markProviderTokenHealthy(
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
  providerId: MusicProviderId,
): void {
  providerErrors[providerId] = providerErrors[providerId] ?? undefined;
}

async function refreshProviderTokenIfNeeded(
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
    markProviderTokenHealthy(providerErrors, providerId);
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

async function refreshProviderTokens(
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): Promise<void> {
  for (const providerId of Object.keys(providerTokens) as MusicProviderId[]) {
    await refreshProviderTokenIfNeeded(providerId, providerTokens, providerErrors);
  }
}

function buildJwtCallbackResult(
  nextToken: AuthJwtToken,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): AuthJwtToken {
  const sessionProviderId = resolveSessionProviderId(providerTokens);
  const sessionProviderToken = sessionProviderId ? providerTokens[sessionProviderId] : undefined;
  const sessionError = sessionProviderId ? providerErrors[sessionProviderId] : undefined;

  return {
    ...nextToken,
    musicProviderTokens: providerTokens,
    providerErrors,
    accessToken: sessionProviderToken?.accessToken,
    refreshToken: sessionProviderToken?.refreshToken,
    accessTokenExpires: sessionProviderToken?.accessTokenExpires,
    error: sessionError,
    isByok: sessionProviderToken?.isByok || false,
    ...(sessionProviderToken?.byok ? { byok: sessionProviderToken.byok } : {}),
  };
}
export const authOptions: AuthOptions = {
  secret: serverEnv.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 12 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  providers: authProviders,
  callbacks: {
    async jwt({ token, account }: any) {
      const nextToken = token as AuthJwtToken;
      const providerTokens = getProviderTokens(nextToken);
      const providerErrors = getInitialProviderErrors(nextToken);

      applyAccountToken(nextToken, account, providerTokens, providerErrors);
      await refreshProviderTokens(providerTokens, providerErrors);

      return buildJwtCallbackResult(nextToken, providerTokens, providerErrors);
    },
    async session({ session, token }: any) {
      const typedToken = token as AuthJwtToken;
      const providerTokens = getProviderTokens(typedToken);
      const providerErrors = typedToken.providerErrors ?? {};
      const sessionProviderId = resolveSessionProviderId(providerTokens);
      const sessionProviderToken = sessionProviderId ? providerTokens[sessionProviderId] : undefined;

      (session as any).musicProviderTokens = Object.entries(providerTokens).reduce(
        (result, [providerId, providerToken]) => {
          if (!providerToken) {
            return result;
          }

          const mappedProviderToken: { accessToken?: string; accessTokenExpires?: number; error?: string; isByok?: boolean } = {
            ...(typeof providerToken.accessToken === 'string' ? { accessToken: providerToken.accessToken } : {}),
            ...(typeof providerToken.accessTokenExpires === 'number'
              ? { accessTokenExpires: providerToken.accessTokenExpires }
              : {}),
            ...(typeof providerToken.error === 'string' ? { error: providerToken.error } : {}),
            ...(providerToken.isByok ? { isByok: true } : {}),
          };

          result[providerId] = mappedProviderToken;

          return result;
        },
        {} as Record<string, { accessToken?: string; accessTokenExpires?: number; error?: string; isByok?: boolean }>
      );
      (session as any).providerErrors = providerErrors;
      (session as any).accessToken = sessionProviderToken?.accessToken;
      (session as any).accessTokenExpires = sessionProviderToken?.accessTokenExpires;
      (session as any).error = sessionProviderId ? providerErrors[sessionProviderId] : undefined;
      (session as any).isByok = sessionProviderToken?.isByok || false;

      if (session.user) {
        if (typedToken.email) {
          session.user.email = typedToken.email;
        }
        if (typedToken.sub) {
          session.user.id = typedToken.sub;
        }
      }

      return session;
    },
    async signIn() {
      return true;
    },
  },
  events: createAuthEvents(),
  logger: authLogger,
};
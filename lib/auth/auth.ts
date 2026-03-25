import type { AuthOptions } from "next-auth";
import { serverEnv } from "@/lib/env";
import { getFallbackMusicProviderId, isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { authLogger, createAuthEvents } from '@/lib/auth/authLogging';
import { createSpotifyAuthProvider, createTidalAuthProvider, TIDAL_TOKEN_URL } from '@/lib/auth/authProviderFactories';
import { restoreProviderTokensFromBackup } from '@/lib/auth/authBackupCookie';
import { buildJwtCallbackResult } from '@/lib/auth/authJwtPayload';

const TOKEN_REFRESH_ERROR = 'RefreshAccessTokenError';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const FALLBACK_PROVIDER_ID = getFallbackMusicProviderId();

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

function resolveLegacyProviderId(
  token: AuthJwtToken,
  fromToken: ProviderTokenStore,
  accountProviderId: MusicProviderId | null,
): MusicProviderId | null {
  if (accountProviderId) {
    return accountProviderId;
  }

  if (Object.keys(fromToken).length > 0) {
    return null;
  }

  if (token.isByok || token.byok) {
    return 'spotify';
  }

  return FALLBACK_PROVIDER_ID;
}

function getProviderTokens(token: AuthJwtToken, accountProviderId: MusicProviderId | null = null): ProviderTokenStore {
  const fromToken = token.musicProviderTokens ?? {};
  const hasLegacyToken =
    typeof token.accessToken === 'string' ||
    typeof token.refreshToken === 'string' ||
    typeof token.accessTokenExpires === 'number';

  const providerTokens: ProviderTokenStore = {
    ...fromToken,
  };

  if (!hasLegacyToken) {
    return providerTokens;
  }

  const legacyProviderId = resolveLegacyProviderId(token, fromToken, accountProviderId);
  if (!legacyProviderId) {
    return providerTokens;
  }

  const previousProviderToken = providerTokens[legacyProviderId] ?? {};
  const mergedProviderToken: ProviderJwtToken = {
    ...previousProviderToken,
    ...(typeof token.accessToken === 'string' ? { accessToken: token.accessToken } : {}),
    ...(typeof token.refreshToken === 'string' ? { refreshToken: token.refreshToken } : {}),
    ...(typeof token.accessTokenExpires === 'number' ? { accessTokenExpires: token.accessTokenExpires } : {}),
    ...(token.isByok ? { isByok: true } : {}),
    ...(token.byok ? { byok: token.byok } : {}),
  };

  if (Object.keys(mergedProviderToken).length > 0) {
    providerTokens[legacyProviderId] = mergedProviderToken;
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


/**
 * Reads the backup cookie saved by /api/auth/preserve-tokens before OAuth redirect.
 * NextAuth v4 creates a fresh default token on sign-in (name/email/sub), which
 * discards custom JWT fields like musicProviderTokens.  This function recovers
 * provider tokens from the backup cookie so a second provider sign-in does not
 * erase the first provider's tokens.
 */
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
    async jwt({ token, account, trigger, session }: any) {
      const nextToken = token as AuthJwtToken;
      const accountProviderId = toMusicProviderId((account as Record<string, unknown> | null)?.provider);
      const providerTokens = getProviderTokens(nextToken, accountProviderId);
      const providerErrors = getInitialProviderErrors(nextToken);

      applyAccountToken(nextToken, account, providerTokens, providerErrors);

      if (account) {
        await restoreProviderTokensFromBackup(providerTokens, accountProviderId, toMusicProviderId);
      }

      if (trigger === 'update' && session?.providerAuthAction === 'logout-provider') {
        const providerId = toMusicProviderId(session.providerId);
        if (providerId) {
          delete providerTokens[providerId];
          providerErrors[providerId] = undefined;
        }
      }

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
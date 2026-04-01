import type { AuthOptions } from "next-auth";
import { serverEnv } from "@/lib/env";
import { getFallbackMusicProviderId, isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { authLogger, createAuthEvents } from '@/lib/auth/authLogging';
import { createSpotifyAuthProvider, createTidalAuthProvider } from '@/lib/auth/authProviderFactories';
import { restoreProviderTokensFromBackup } from '@/lib/auth/authBackupCookie';
import { buildJwtCallbackResult } from '@/lib/auth/authJwtPayload';
import {
  refreshProviderTokens,
  TOKEN_REFRESH_ERROR,
  type ProviderJwtToken,
  type ProviderTokenStore,
} from '@/lib/auth/tokenRefresh';
import { persistProviderTokens, deleteProviderTokens, markTokenStatus, getProviderTokens as getDbProviderTokens } from '@/lib/auth/tokenStore';
import { isTokenEncryptionAvailable } from '@/lib/auth/tokenEncryption';
import { resetCircuitBreaker } from '@/lib/auth/refreshCircuitBreaker';

const FALLBACK_PROVIDER_ID = getFallbackMusicProviderId();

// ---------------------------------------------------------------------------
// Single-flight refresh lock — prevents concurrent JWT callbacks from racing
// on the same refresh token (Spotify rotates refresh tokens, so the second
// concurrent call would get "revoked").
// ---------------------------------------------------------------------------

type RefreshResult = {
  tokens: ProviderTokenStore;
  errors: Partial<Record<MusicProviderId, string | undefined>>;
};

const jwtRefreshInFlight = new Map<string, Promise<RefreshResult>>();

async function refreshTokensWithDedup(
  userId: string,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): Promise<void> {
  const inflight = jwtRefreshInFlight.get(userId);
  if (inflight) {
    const result = await inflight;
    for (const [pid, token] of Object.entries(result.tokens) as [MusicProviderId, ProviderJwtToken | undefined][]) {
      if (token) providerTokens[pid] = token;
    }
    for (const [pid, error] of Object.entries(result.errors) as [MusicProviderId, string | undefined][]) {
      providerErrors[pid] = error;
    }
    return;
  }

  const promise = (async () => {
    await refreshProviderTokens(providerTokens, providerErrors);
    return {
      tokens: { ...providerTokens },
      errors: { ...providerErrors },
    };
  })();

  jwtRefreshInFlight.set(userId, promise);
  try {
    await promise;
  } finally {
    jwtRefreshInFlight.delete(userId);
  }
}

// ---------------------------------------------------------------------------
// DB fallback — when refresh fails, try to recover from a token that was
// successfully refreshed and persisted by an earlier request.
// ---------------------------------------------------------------------------

function dbTokenToProviderJwt(dbToken: NonNullable<ReturnType<typeof getDbProviderTokens>>): ProviderJwtToken {
  return {
    accessToken: dbToken.accessToken,
    refreshToken: dbToken.refreshToken,
    ...(dbToken.accessTokenExpires != null ? { accessTokenExpires: dbToken.accessTokenExpires } : {}),
    isByok: dbToken.isByok,
    ...(dbToken.byokClientId && dbToken.byokClientSecret ? {
      byok: { clientId: dbToken.byokClientId, clientSecret: dbToken.byokClientSecret },
    } : {}),
  };
}

function tryRecoverFromDb(
  userId: string,
  providerTokens: ProviderTokenStore,
  providerErrors: Partial<Record<MusicProviderId, string | undefined>>,
): void {
  if (!isTokenEncryptionAvailable()) return;

  for (const pid of Object.keys(providerTokens) as MusicProviderId[]) {
    const pt = providerTokens[pid];
    if (pt?.error !== TOKEN_REFRESH_ERROR) continue;

    try {
      const dbToken = getDbProviderTokens(userId, pid);
      if (!dbToken?.accessToken || !dbToken.refreshToken) continue;

      // Only use DB token if it's different (i.e. a newer successful refresh)
      if (dbToken.refreshToken === pt.refreshToken) continue;

      console.debug(`[auth] Recovering ${pid} token from DB after refresh failure`);
      providerTokens[pid] = dbTokenToProviderJwt(dbToken);
      providerErrors[pid] = undefined;
    } catch {
      // DB read failure should never break auth flow
    }
  }
}

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

function getProviderTokens(token: AuthJwtToken, _accountProviderId: MusicProviderId | null = null): ProviderTokenStore {
  return {
    ...(token.musicProviderTokens ?? {}),
  };
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

const authProviders = [
  ...(isMusicProviderEnabled('spotify') ? [createSpotifyAuthProvider()] : []),
  ...(isMusicProviderEnabled('tidal') ? [createTidalAuthProvider()] : []),
];

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
    console.debug(
      `[auth] ${providerId} initial token: expires_at=${expiresAt} (in ${Math.round((expiresAt - Date.now()) / 1000)}s), has_refresh_token=${Boolean(accountData.refresh_token)}, raw_expires_at=${accountData.expires_at}, raw_expires_in=${accountData.expires_in}`,
    );
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


// ---------------------------------------------------------------------------
// Persistent token DB helpers — each call is wrapped in try-catch so a DB
// failure never breaks the auth flow.
// ---------------------------------------------------------------------------

function safePersistSingleProvider(
  userId: string,
  providerId: MusicProviderId,
  pt: ProviderJwtToken,
): void {
  try {
    persistProviderTokens({
      userId,
      provider: providerId,
      accessToken: pt.accessToken!,
      refreshToken: pt.refreshToken!,
      accessTokenExpires: pt.accessTokenExpires ?? null,
      isByok: pt.isByok ?? false,
      byokClientId: pt.byok?.clientId ?? null,
      byokClientSecret: pt.byok?.clientSecret ?? null,
    });
  } catch {
    // DB write failure should never break auth flow
  }
}

function persistSignInTokens(
  userId: string | undefined,
  accountProviderId: MusicProviderId | null,
  providerTokens: ProviderTokenStore,
): void {
  if (!userId || !accountProviderId || !isTokenEncryptionAvailable()) return;
  const providerToken = providerTokens[accountProviderId];
  if (!providerToken?.accessToken || !providerToken?.refreshToken) return;
  safePersistSingleProvider(userId, accountProviderId, providerToken);
}

function persistRefreshedTokens(
  userId: string | undefined,
  providerTokens: ProviderTokenStore,
): void {
  if (!userId || !isTokenEncryptionAvailable()) return;
  for (const [pid, pt] of Object.entries(providerTokens) as [MusicProviderId, ProviderJwtToken | undefined][]) {
    if (pt?.accessToken && pt?.refreshToken && !pt.error) {
      safePersistSingleProvider(userId, pid, pt);
    }
    if (pt?.error === TOKEN_REFRESH_ERROR) {
      try {
        markTokenStatus(userId, pid, 'needs_reauth');
      } catch {
        // DB failure should never break auth flow
      }
    }
  }
}

async function setUidCookie(userId: string | undefined): Promise<void> {
  if (!userId) return;
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    cookieStore.set('__listmagify_uid', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    });
  } catch {
    // cookies() may not be available in all contexts
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
        if (accountProviderId) {
          resetCircuitBreaker(accountProviderId);
        }
      }

      // Persist tokens from initial sign-in to DB
      persistSignInTokens(nextToken.sub, accountProviderId, providerTokens);

      if (trigger === 'update' && session?.providerAuthAction === 'logout-provider') {
        const providerId = toMusicProviderId(session.providerId);
        if (providerId) {
          delete providerTokens[providerId];
          providerErrors[providerId] = undefined;

          // Remove tokens from persistent DB
          if (nextToken.sub) {
            try {
              deleteProviderTokens(nextToken.sub, providerId);
            } catch {
              // DB failure should never break auth flow
            }
          }
        }
      }

      if (nextToken.sub) {
        await refreshTokensWithDedup(nextToken.sub, providerTokens, providerErrors);
      } else {
        await refreshProviderTokens(providerTokens, providerErrors);
      }

      // If refresh failed, try to recover from DB (another request may have
      // already refreshed successfully and persisted the new token).
      if (nextToken.sub) {
        tryRecoverFromDb(nextToken.sub, providerTokens, providerErrors);
      }

      // Persist refreshed tokens to DB
      persistRefreshedTokens(nextToken.sub, providerTokens);

      // Set UID cookie for DB session restoration fallback
      await setUidCookie(nextToken.sub);

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

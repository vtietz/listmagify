/**
 * Server-side authentication utilities.
 * Provides standardized auth checking for API routes.
 */

import { getFallbackMusicProviderId } from '@/lib/music-provider/enabledProviders';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { isMusicProviderId } from '@/lib/music-provider/providerId';

const TOKEN_REFRESH_ERROR = 'RefreshAccessTokenError';

/**
 * Custom error for server-side auth failures.
 * Thrown when a session is missing or invalid.
 */
export class ServerAuthError extends Error {
  constructor(
    message: string,
    public readonly reason: 'no_session' | 'token_expired' | 'refresh_failed'
  ) {
    super(message);
    this.name = 'ServerAuthError';
  }
}

/**
 * Session with typed access token.
 */
export interface AuthenticatedSession {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  accessToken: string;
  accessTokenExpires?: number;
  providerId?: MusicProviderId;
}

function getE2ESession(): AuthenticatedSession | null {
  if (process.env.E2E_MODE !== '1') {
    return null;
  }

  return {
    user: {
      id: 'e2e-user',
      name: 'E2E Test User',
      email: 'e2e@example.com',
    },
    accessToken: 'e2e-access-token',
    accessTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
    providerId: getFallbackMusicProviderId(),
  };
}

type SessionProviderToken = {
  accessToken?: string;
  accessTokenExpires?: number;
  error?: string;
};

function getProviderTokenFromSession(session: any, providerId: MusicProviderId): SessionProviderToken | null {
  const providerToken = session?.musicProviderTokens?.[providerId];
  if (!providerToken || typeof providerToken !== 'object') {
    return null;
  }

  return {
    accessToken: providerToken.accessToken,
    accessTokenExpires: providerToken.accessTokenExpires,
    error: providerToken.error,
  };
}

function getAnyProviderTokenFromSession(session: any): {
  providerId: MusicProviderId;
  token: SessionProviderToken;
} | null {
  const providerTokenStore = session?.musicProviderTokens;
  if (!providerTokenStore || typeof providerTokenStore !== 'object') {
    return null;
  }

  const candidates = Object.entries(providerTokenStore)
    .filter((entry): entry is [MusicProviderId, unknown] => isMusicProviderId(entry[0]))
    .map(([providerId]) => {
      const token = getProviderTokenFromSession(session, providerId);
      return {
        providerId,
        token,
      };
    })
    .filter((entry): entry is { providerId: MusicProviderId; token: SessionProviderToken } =>
      Boolean(entry.token?.accessToken)
    );

  if (candidates.length === 0) {
    return null;
  }

  const fallbackProviderId = getFallbackMusicProviderId();
  candidates.sort((left, right) => {
    if (left.providerId === fallbackProviderId) return -1;
    if (right.providerId === fallbackProviderId) return 1;
    return 0;
  });

  return candidates[0] ?? null;
}

function buildAuthenticatedSession(params: {
  user?: AuthenticatedSession['user'];
  accessToken: string;
  accessTokenExpires?: number | undefined;
  providerId?: MusicProviderId | undefined;
}): AuthenticatedSession {
  return {
    accessToken: params.accessToken,
    ...(params.user ? { user: params.user } : {}),
    ...(typeof params.accessTokenExpires === 'number' ? { accessTokenExpires: params.accessTokenExpires } : {}),
    ...(params.providerId ? { providerId: params.providerId } : {}),
  };
}

function throwIfRefreshFailed(error: unknown): void {
  if (error === TOKEN_REFRESH_ERROR) {
    throw new ServerAuthError('Token refresh failed', 'refresh_failed');
  }
}

function requireSessionForProvider(session: any, typedSession: any, providerId: MusicProviderId): AuthenticatedSession {
  const selectedProviderToken = getProviderTokenFromSession(typedSession, providerId);
  const providerError = typedSession?.providerErrors?.[providerId] ?? selectedProviderToken?.error;
  throwIfRefreshFailed(providerError);

  if (selectedProviderToken?.accessToken) {
    return buildAuthenticatedSession({
      user: session.user,
      accessToken: selectedProviderToken.accessToken,
      accessTokenExpires: selectedProviderToken.accessTokenExpires,
      providerId,
    });
  }

  throw new ServerAuthError(`No access token in session for provider '${providerId}'`, 'token_expired');
}

function requireDefaultSession(session: any, typedSession: any): AuthenticatedSession {
  const defaultProviderToken = getAnyProviderTokenFromSession(typedSession);
  if (defaultProviderToken) {
    return buildAuthenticatedSession({
      user: session.user,
      accessToken: defaultProviderToken.token.accessToken!,
      accessTokenExpires: defaultProviderToken.token.accessTokenExpires,
      providerId: defaultProviderToken.providerId,
    });
  }

  throw new ServerAuthError('No access token in session', 'token_expired');
}

/**
 * Attempt to restore a session-like object from the persistent token DB.
 * Uses the UID cookie to identify the user, then fetches tokens for all providers.
 * Returns null on any failure — this is a best-effort fallback.
 */
async function tryRestoreFromDb(): Promise<any | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const uidCookie = cookieStore.get('__listmagify_uid');
    if (!uidCookie?.value) return null;

    const { getSessionFromDb } = await import('./sessionFromDb');

    // Parse UID cookie — JSON map of provider → prefixed user ID
    let uidMap: Record<string, string>;
    try {
      uidMap = JSON.parse(uidCookie.value);
    } catch {
      return null;
    }

    const tokenResults: Record<string, any> = {};
    let firstUserId: string | undefined;

    for (const [pid, userId] of Object.entries(uidMap)) {
      if (!userId) continue;
      if (!firstUserId) firstUserId = userId;
      const dbSession = await getSessionFromDb(userId, pid as MusicProviderId);
      if (dbSession) {
        tokenResults[pid] = {
          accessToken: dbSession.accessToken,
          accessTokenExpires: dbSession.accessTokenExpires,
        };
      }
    }

    if (Object.keys(tokenResults).length === 0) return null;

    return {
      user: { id: firstUserId },
      musicProviderTokens: tokenResults,
    };
  } catch {
    return null;
  }
}

/**
 * Require an authenticated session with a valid access token.
 * Throws ServerAuthError if not authenticated or token is invalid.
 *
 * Usage:
 * ```ts
 * export async function GET(request: NextRequest) {
 *   try {
 *     const session = await requireAuth();
 *     // Use session.accessToken
 *   } catch (error) {
 *     if (error instanceof ServerAuthError) {
 *       return NextResponse.json({ error: 'token_expired' }, { status: 401 });
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export async function requireAuth(providerId?: MusicProviderId): Promise<AuthenticatedSession> {
  const e2eSession = getE2ESession();
  if (e2eSession) {
    return e2eSession;
  }

  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import('next-auth'),
    import('./auth'),
  ]);

  const session = await getServerSession(authOptions);

  if (!session) {
    // Try to restore session from persistent token DB
    const restoredSession = await tryRestoreFromDb();
    if (restoredSession) {
      const typedSession = restoredSession as any;
      if (providerId) {
        return requireSessionForProvider(restoredSession, typedSession, providerId);
      }
      return requireDefaultSession(restoredSession, typedSession);
    }
    throw new ServerAuthError('No session found', 'no_session');
  }

  const typedSession = session as any;

  if (providerId) {
    return requireSessionForProvider(session, typedSession, providerId);
  }

  return requireDefaultSession(session, typedSession);
}

/**
 * Try to get an authenticated session, returning null if not authenticated.
 * Use this when authentication is optional.
 */
export async function tryAuth(providerId?: MusicProviderId): Promise<AuthenticatedSession | null> {
  try {
    return await requireAuth(providerId);
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return null;
    }
    throw error;
  }
}

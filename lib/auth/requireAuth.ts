/**
 * Server-side authentication utilities.
 * Provides standardized auth checking for API routes.
 */

import { getFallbackMusicProviderId } from '@/lib/music-provider/enabledProviders';
import type { MusicProviderId } from '@/lib/music-provider/types';

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
  const fallbackProviderId = getFallbackMusicProviderId();
  const providerOrder: MusicProviderId[] = fallbackProviderId === 'spotify'
    ? [fallbackProviderId, 'tidal']
    : [fallbackProviderId, 'spotify'];

  for (const providerId of providerOrder) {
    const token = getProviderTokenFromSession(session, providerId);
    if (token?.accessToken) {
      return { providerId, token };
    }
  }

  return null;
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
    throw new ServerAuthError('No session found', 'no_session');
  }

  const typedSession = session as any;

  if (providerId) {
    const selectedProviderToken = getProviderTokenFromSession(typedSession, providerId);
    const providerError = typedSession?.providerErrors?.[providerId] ?? selectedProviderToken?.error;

    if (providerError === TOKEN_REFRESH_ERROR) {
      throw new ServerAuthError('Token refresh failed', 'refresh_failed');
    }

    if (!selectedProviderToken?.accessToken) {
      if (
        providerId === 'spotify' &&
        typeof typedSession.accessToken === 'string'
      ) {
        if (typedSession.error === TOKEN_REFRESH_ERROR) {
          throw new ServerAuthError('Token refresh failed', 'refresh_failed');
        }

        return {
          user: session.user,
          accessToken: typedSession.accessToken,
          ...(typeof typedSession.accessTokenExpires === 'number'
            ? { accessTokenExpires: typedSession.accessTokenExpires }
            : {}),
          providerId,
        };
      }

      throw new ServerAuthError(`No access token in session for provider '${providerId}'`, 'token_expired');
    }

    return {
      user: session.user,
      accessToken: selectedProviderToken.accessToken,
      ...(typeof selectedProviderToken.accessTokenExpires === 'number'
        ? { accessTokenExpires: selectedProviderToken.accessTokenExpires }
        : {}),
      providerId,
    };
  }

  const defaultProviderToken = getAnyProviderTokenFromSession(typedSession);
  if (defaultProviderToken) {
    return {
      user: session.user,
      accessToken: defaultProviderToken.token.accessToken!,
      ...(typeof defaultProviderToken.token.accessTokenExpires === 'number'
        ? { accessTokenExpires: defaultProviderToken.token.accessTokenExpires }
        : {}),
      providerId: defaultProviderToken.providerId,
    };
  }

  if (typedSession.error === TOKEN_REFRESH_ERROR) {
    throw new ServerAuthError('Token refresh failed', 'refresh_failed');
  }

  const accessToken = typedSession.accessToken;
  if (!accessToken) {
    throw new ServerAuthError('No access token in session', 'token_expired');
  }

  return {
    user: session.user,
    accessToken,
    ...(typeof typedSession.accessTokenExpires === 'number'
      ? { accessTokenExpires: typedSession.accessTokenExpires }
      : {}),
  };
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

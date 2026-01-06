/**
 * Server-side authentication utilities.
 * Provides standardized auth checking for API routes.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

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
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  accessToken: string;
  accessTokenExpires?: number;
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
export async function requireAuth(): Promise<AuthenticatedSession> {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new ServerAuthError('No session found', 'no_session');
  }

  // Check for refresh token error
  if ((session as any).error === 'RefreshAccessTokenError') {
    throw new ServerAuthError('Token refresh failed', 'refresh_failed');
  }

  const accessToken = (session as any).accessToken;
  if (!accessToken) {
    throw new ServerAuthError('No access token in session', 'token_expired');
  }

  return {
    user: session.user,
    accessToken,
    accessTokenExpires: (session as any).accessTokenExpires,
  };
}

/**
 * Try to get an authenticated session, returning null if not authenticated.
 * Use this when authentication is optional.
 */
export async function tryAuth(): Promise<AuthenticatedSession | null> {
  try {
    return await requireAuth();
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return null;
    }
    throw error;
  }
}

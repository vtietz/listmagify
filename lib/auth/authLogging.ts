import { logAuthEvent, startSession } from '@/lib/metrics';
import { getDb } from '@/lib/metrics/db';

type SignInMessage = any;

function formatDebugUser(user: any): string {
  return user?.email ?? user?.name ?? '[unknown]';
}

function extractSignInData(message: SignInMessage): {
  providerAccountId: string | undefined;
  accessToken: string | undefined;
  email: string | undefined;
  userAgent: string | undefined;
  provider: string | undefined;
  debugUser: string;
} {
  const account = message?.account;
  const user = message?.user;

  return {
    providerAccountId: account?.providerAccountId,
    accessToken: account?.access_token,
    email: user?.email,
    userAgent: user?.userAgent,
    provider: account?.provider,
    debugUser: formatDebugUser(user),
  };
}

async function fetchSpotifyUserId(accessToken: string, fallback: string): Promise<string> {
  try {
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (meRes.ok) {
      const meData = await meRes.json();
      return meData.id;
    }
  } catch {
    // Fall back to providerAccountId
  }

  return fallback;
}

async function linkUserToAccessRequest(spotifyUserId: string, email: string | undefined): Promise<void> {
  if (!email) {
    return;
  }

  const db = getDb();
  if (!db) {
    return;
  }

  try {
    db.prepare(`
      UPDATE access_requests 
      SET user_id = ? 
      WHERE email = ? 
        AND status = 'approved' 
        AND user_id IS NULL
    `).run(spotifyUserId, email);
  } catch (err) {
    console.error('[auth] Failed to link user_id to access request:', err);
  }
}

export function createAuthEvents() {
  return {
    async signIn(message: SignInMessage) {
      try {
        const { providerAccountId, accessToken, email, userAgent, provider, debugUser } = extractSignInData(message);
        const trackedUserId = provider === 'spotify' && accessToken
          ? await fetchSpotifyUserId(accessToken, providerAccountId ?? '')
          : providerAccountId;

        console.debug('[auth] NextAuth signIn', {
          provider,
          providerAccountId,
          trackedUserId,
          user: debugUser,
        });

        if (trackedUserId) {
          logAuthEvent('login_success', trackedUserId);
          startSession(trackedUserId, userAgent);

          if (provider === 'spotify') {
            await linkUserToAccessRequest(trackedUserId, email);
          }
        }
      } catch {
        // noop
      }
    },
    signOut(_message: any) {
      console.debug('[auth] NextAuth signOut');
    },
  };
}

export const authLogger = {
  error(code: any, ...args: any[]) {
    console.error('[auth] NextAuth logger error', code, ...args);

    if (code && typeof code === 'object') {
      const errorCode = code.message || code.code || code.name || String(code);
      const errorStr = String(errorCode).toLowerCase();

      if (
        errorStr.includes('access') ||
        errorStr.includes('denied') ||
        errorStr.includes('oauth') ||
        errorStr.includes('unauthorized')
      ) {
        logAuthEvent('login_failure', undefined, errorStr.substring(0, 100));
      }
    }
  },
  warn(...args: any[]) {
    console.warn('[auth] NextAuth logger warn', ...args);
  },
  debug(...args: any[]) {
    if (args[0] === 'CHUNKING_SESSION_COOKIE') {
      return;
    }

    console.debug('[auth] NextAuth logger debug', ...args);
  },
};

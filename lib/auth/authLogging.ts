import { logAuthEvent, startSession } from '@/lib/metrics';
import { getDb } from '@/lib/metrics/db';

type SignInMessage = any;
type ProviderId = 'spotify' | 'tidal';
type ProviderAuthCode =
  | 'ok'
  | 'unauthenticated'
  | 'expired'
  | 'invalid'
  | 'insufficient_scope'
  | 'network'
  | 'rate_limited'
  | 'provider_unavailable';

function extractSignInData(message: SignInMessage): {
  providerAccountId: string | undefined;
  accessToken: string | undefined;
  email: string | undefined;
  userAgent: string | undefined;
  provider: string | undefined;
} {
  const account = message?.account;
  const user = message?.user;

  return {
    providerAccountId: account?.providerAccountId,
    accessToken: account?.access_token,
    email: user?.email,
    userAgent: user?.userAgent,
    provider: account?.provider,
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
        const { providerAccountId, accessToken, email, userAgent, provider } = extractSignInData(message);
        const trackedUserId = provider === 'spotify' && accessToken
          ? await fetchSpotifyUserId(accessToken, providerAccountId ?? '')
          : providerAccountId;

        console.debug('[auth] signIn', {
          provider,
          userId: trackedUserId ?? providerAccountId,
        });

        if (trackedUserId) {
          const providerId = provider === 'tidal' ? 'tidal' : 'spotify';
          logAuthEvent('login_success', trackedUserId, undefined, undefined, providerId);
          startSession(trackedUserId, userAgent, providerId);

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
        const provider = errorStr.includes('tidal') ? 'tidal' : 'spotify';
        logAuthEvent('login_failure', undefined, errorStr.substring(0, 100), undefined, provider);
      }
    }
  },
  warn(...args: any[]) {
    console.warn('[auth] NextAuth logger warn', ...args);
  },
  debug(code: string, ..._args: any[]) {
    // Only log session-lifecycle events; suppress verbose OAuth dumps
    // (GET_AUTHORIZATION_URL, PROFILE_DATA, OAUTH_CALLBACK_RESPONSE, etc.)
    if (code === 'SESSION_CREATED' || code === 'SESSION_UPDATED') {
      console.debug('[auth]', code);
    }
  },
};

type ProviderAuthEventName =
  | 'inline_login_shown'
  | 'inline_login_clicked'
  | 'token_refresh_attempted'
  | 'token_refresh_succeeded'
  | 'token_refresh_failed';

type ProviderAuthLogPayload = {
  provider: ProviderId;
  reason?: ProviderAuthCode;
  message?: string;
};

function logProviderAuthEvent(event: ProviderAuthEventName, payload: ProviderAuthLogPayload): void {
  console.debug('[auth] provider-event', {
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

export function logInlineLoginShown(provider: ProviderId, reason: ProviderAuthCode): void {
  logProviderAuthEvent('inline_login_shown', { provider, reason });
}

export function logInlineLoginClicked(provider: ProviderId): void {
  logProviderAuthEvent('inline_login_clicked', { provider });
}

export function logTokenRefreshAttempted(provider: ProviderId): void {
  logProviderAuthEvent('token_refresh_attempted', { provider });
}

export function logTokenRefreshSucceeded(provider: ProviderId): void {
  logProviderAuthEvent('token_refresh_succeeded', { provider });
}

export function logTokenRefreshFailed(provider: ProviderId, message?: string): void {
  logProviderAuthEvent('token_refresh_failed', { provider, ...(message ? { message } : {}) });
}

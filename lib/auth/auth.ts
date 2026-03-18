import SpotifyProvider from "next-auth/providers/spotify";
import type { AuthOptions } from "next-auth";
import { serverEnv } from "@/lib/env";
import { isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import { logAuthEvent, startSession } from "@/lib/metrics";
import { getDb } from "@/lib/metrics/db";

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

async function linkUserToAccessRequest(db: ReturnType<typeof getDb>, spotifyUserId: string, email: string | undefined): Promise<void> {
  if (!db || !email) return;
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


function resolveClientCredentials(token: Record<string, any>): { clientId: string; clientSecret: string } {
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
        // Scopes for playlist viewing/editing, user library (liked songs), playback control, and web playback SDK
        scope: "user-read-email user-read-private playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify user-read-playback-state user-modify-playback-state streaming",
      },
    },
    // Enable PKCE for Authorization Code flow
    checks: ["pkce", "state"],
  });
}

const authProviders = isMusicProviderEnabled('spotify')
  ? [createSpotifyAuthProvider()]
  : [];

function formatDebugUser(user: any): string {
  return user?.email ?? user?.name ?? '[unknown]';
}

function extractSignInData(message: any): {
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


function buildRefreshedToken(token: Record<string, any>, data: any): Record<string, any> {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  return {
    ...token,
    accessToken: data.access_token,
    accessTokenExpires: Date.now() + expiresInMs,
    refreshToken: data.refresh_token ?? token.refreshToken,
    isByok: token.isByok,
    error: undefined,
  };
}

/**
 * Refresh Spotify access token using the stored refresh token.
 * Supports both default credentials and BYOK (Bring Your Own Key) credentials.
 * Spotify docs: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
 */
async function refreshAccessToken(token: Record<string, any>) {
  try {
    if (!token.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const { clientId, clientSecret } = resolveClientCredentials(token);

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

    return buildRefreshedToken(token, data);
  } catch (error) {
    if (error instanceof Error && error.message.includes('revoked')) {
      return { ...token, error: "RefreshAccessTokenError" };
    }
    console.warn("[auth] refreshAccessToken error", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

/**
 * NextAuth configuration (PKCE + JWT strategy).
 * - Persistent sessions: 30 days with 12-hour refresh cycle
 * - Access token stored in JWT and auto-refreshed on expiry
 * - httpOnly, secure cookies prevent XSS token exposure
 */
export const authOptions: AuthOptions = {
  secret: serverEnv.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days - session persists across browser restarts
    updateAge: 12 * 60 * 60, // 12 hours - reissue cookie to keep session fresh
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days - align JWT expiry with session
  },
  // cookies: {
  //   // Fix for Docker/127.0.0.1 environments - ensure cookies work properly
  //   sessionToken: {
  //     name: `next-auth.session-token`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false, // Allow cookies on http://127.0.0.1 during development
  //     },
  //   },
  //   callbackUrl: {
  //     name: `next-auth.callback-url`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false,
  //     },
  //   },
  //   csrfToken: {
  //     name: `next-auth.csrf-token`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false,
  //     },
  //   },
  //   pkceCodeVerifier: {
  //     name: `next-auth.pkce.code_verifier`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false,
  //       maxAge: 900, // 15 minutes
  //     },
  //   },
  //   state: {
  //     name: `next-auth.state`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false,
  //       maxAge: 900, // 15 minutes
  //     },
  //   },
  //   nonce: {
  //     name: `next-auth.nonce`,
  //     options: {
  //       httpOnly: true,
  //       sameSite: 'lax',
  //       path: '/',
  //       secure: false,
  //     },
  //   },
  // },
  pages: {
    signIn: "/",
    error: "/",  // Redirect OAuth errors to landing page with ?error= param
  },
  providers: authProviders,
  callbacks: {
    /**
     * Persist the OAuth access_token, refresh_token, and expiry in the JWT.
     * Refresh automatically when expired or within 5 minutes of expiry.
     */
    async jwt({ token, account }: any) {
      // Initial sign-in
      if (account) {
        const accountData = account as any;
        const rawExpiresAt = accountData.expires_at;
        const rawExpiresIn = accountData.expires_in;

        const expiresAt = (() => {
          if (typeof rawExpiresAt === 'number' && Number.isFinite(rawExpiresAt) && rawExpiresAt > 0) {
            // ms epoch
            if (rawExpiresAt > 10_000_000_000) {
              return rawExpiresAt;
            }

            // unix timestamp seconds (normal case)
            if (rawExpiresAt > 1_000_000_000) {
              return rawExpiresAt * 1000;
            }

            // seconds-until-expiry (defensive fallback)
            return Date.now() + rawExpiresAt * 1000;
          }

          if (typeof rawExpiresIn === 'number' && Number.isFinite(rawExpiresIn) && rawExpiresIn > 0) {
            return Date.now() + rawExpiresIn * 1000;
          }

          return Date.now() + 3600 * 1000;
        })();
        
        return {
          ...token,
          accessToken: accountData.access_token,
          refreshToken: accountData.refresh_token ?? token.refreshToken,
          accessTokenExpires: expiresAt,
          error: undefined,
        };
      }

      // Early refresh: 5 minutes before expiry (300 seconds = 300000 ms)
      const REFRESH_BUFFER_MS = 5 * 60 * 1000;
      const shouldRefresh = token.accessTokenExpires && 
        Date.now() >= ((token.accessTokenExpires as number) - REFRESH_BUFFER_MS);

      // If token still valid and not in refresh window, return it
      if (!shouldRefresh) {
        return token;
      }

      // Token expired or expiring soon, attempt refresh
      console.debug("[auth] Token expiring soon or expired, refreshing...");
      return await refreshAccessToken(token as Record<string, any>);
    },

    /**
     * Expose accessToken and error state on the session for server-side fetchers.
     */
    async session({ session, token }: any) {
      (session as any).accessToken = token.accessToken;
      (session as any).accessTokenExpires = token.accessTokenExpires;
      (session as any).error = token.error;
      (session as any).isByok = token.isByok || false; // Expose BYOK flag
      
      // Add user info if available
      if (session.user) {
        if (token.email) {
          session.user.email = token.email;
        }
        // Add Spotify user ID from JWT sub (subject) claim
        if (token.sub) {
          session.user.id = token.sub;
        }
      }
      
      return session;
    },

    /**
     * Control whether sign-in is allowed.
     * Use this to track failed login attempts.
     */
    async signIn() {
      // Always allow sign-in to proceed - NextAuth will handle OAuth errors
      // We just use this callback to track the attempt
      return true;
    },
  },
  events: {
    async signIn(message: any) {
      try {
        const { providerAccountId, accessToken, email, userAgent, provider, debugUser } = extractSignInData(message);
        const spotifyUserId = accessToken
          ? await fetchSpotifyUserId(accessToken, providerAccountId ?? '')
          : providerAccountId;

        console.debug("[auth] NextAuth signIn", {
          provider,
          providerAccountId,
          spotifyUserId,
          user: debugUser,
        });

        if (spotifyUserId) {
          logAuthEvent('login_success', spotifyUserId);
          startSession(spotifyUserId, userAgent);
          await linkUserToAccessRequest(getDb(), spotifyUserId, email);
        }
      } catch {
        // noop
      }
    },
    signOut(_message: any) {
      console.debug("[auth] NextAuth signOut");
      // Note: We don't have easy access to user ID on signOut
      // Session tracking is handled by session duration calculation
    },
  },
  logger: {
    error(code: any, ...args: any[]) {
      console.error("[auth] NextAuth logger error", code, ...args);
      
      // Track failed login attempts (OAuth errors, access denied, etc.)
      // Only track certain error codes that indicate failed user login attempts
      if (code && typeof code === 'object') {
        const errorCode = code.message || code.code || code.name || String(code);
        const errorStr = String(errorCode).toLowerCase();
        
        // Track access denied (user not approved) and OAuth callback failures
        if (
          errorStr.includes('access') ||
          errorStr.includes('denied') ||
          errorStr.includes('oauth') ||
          errorStr.includes('unauthorized')
        ) {
          // Log as failed login attempt without user ID (since they didn't successfully authenticate)
          logAuthEvent('login_failure', undefined, errorStr.substring(0, 100));
        }
      }
    },
    warn(...args: any[]) {
      console.warn("[auth] NextAuth logger warn", ...args);
    },
    debug(...args: any[]) {
      console.debug("[auth] NextAuth logger debug", ...args);
    },
  },
};
import type { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";
import { serverEnv, summarizeEnv } from "@/lib/env";

console.log(
  `[auth] env=${summarizeEnv()} | CALLBACK=${new URL(
    "/api/auth/callback/spotify",
    serverEnv.NEXTAUTH_URL
  ).toString()}`
);
/**
 * Refresh Spotify access token using the stored refresh token.
 * Spotify docs: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
 */
async function refreshAccessToken(token: Record<string, any>) {
  try {
    if (!token.refreshToken) {
      throw new Error("Missing refresh token");
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
      client_id: serverEnv.SPOTIFY_CLIENT_ID,
      client_secret: serverEnv.SPOTIFY_CLIENT_SECRET,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        `Failed to refresh token: ${res.status} ${res.statusText} ${JSON.stringify(data)}`
      );
    }

    const expiresInMs = (data.expires_in ?? 3600) * 1000;

    return {
      ...token,
      accessToken: data.access_token,
      accessTokenExpires: Date.now() + expiresInMs,
      // Some providers only return a new refresh_token sometimes.
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.warn("[auth] refreshAccessToken error", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

/**
 * NextAuth configuration (PKCE + JWT strategy).
 * - Persistent sessions: 30 days with 12-hour refresh cycle
 * - Access token stored in JWT and auto-refreshed on expiry
 * - httpOnly, secure cookies prevent XSS token exposure
 */
export const authOptions: NextAuthOptions = {
  secret: serverEnv.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days - session persists across browser restarts
    updateAge: 12 * 60 * 60, // 12 hours - reissue cookie to keep session fresh
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days - align JWT expiry with session
  },
  cookies: {
    // Fix for Docker/127.0.0.1 environments - ensure cookies work properly
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false, // Allow cookies on http://127.0.0.1 during development
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 900, // 15 minutes
      },
    },
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 900, // 15 minutes
      },
    },
    nonce: {
      name: `next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    SpotifyProvider({
      clientId: serverEnv.SPOTIFY_CLIENT_ID,
      clientSecret: serverEnv.SPOTIFY_CLIENT_SECRET,
      authorization: {
        params: {
          // Scopes for playlist viewing and editing
          scope: "user-read-email playlist-read-private playlist-modify-private playlist-modify-public",
        },
      },
      // Enable PKCE for Authorization Code flow
      checks: ["pkce", "state"],
    }),
  ],
  callbacks: {
    /**
     * Persist the OAuth access_token, refresh_token, and expiry in the JWT.
     * Refresh automatically when expired.
     */
    async jwt({ token, account }: any) {
      // Initial sign-in
      if (account) {
        return {
          ...token,
          accessToken: (account as any).access_token,
          refreshToken: (account as any).refresh_token,
          accessTokenExpires:
            Date.now() +
            (((account as any).expires_at ? (account as any).expires_at * 1000 : 3600 * 1000) as number),
        };
      }

      // If token still valid, return it
      if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Token expired, attempt refresh
      return await refreshAccessToken(token as Record<string, any>);
    },

    /**
     * Expose accessToken on the session for server-side fetchers.
     */
    async session({ session, token }: any) {
      (session as any).accessToken = token.accessToken;
      (session as any).error = token.error;
      return session;
    },
  },
  events: {
    error(error: any) {
      console.error("[auth] NextAuth event error", error);
    },
    signIn(message: any) {
      try {
        console.log("[auth] NextAuth signIn", {
          provider: message?.account?.provider,
          providerAccountId: message?.account?.providerAccountId,
          user: message?.user?.email ?? message?.user?.name ?? "[unknown]",
        });
      } catch {
        // noop
      }
    },
    signOut(_message: any) {
      console.log("[auth] NextAuth signOut");
    },
  },
  logger: {
    error(...args: any[]) {
      console.error("[auth] NextAuth logger error", ...args);
    },
    warn(...args: any[]) {
      console.warn("[auth] NextAuth logger warn", ...args);
    },
    debug(...args: any[]) {
      console.debug("[auth] NextAuth logger debug", ...args);
    },
  },
};
import type { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";
import { serverEnv } from "@/lib/env";

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
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax", // Allows OAuth redirects while preventing CSRF
        path: "/",
        secure: process.env.NODE_ENV === "production", // HTTPS-only in production
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
          // Read-only scopes for Step 1
          scope: "user-read-email playlist-read-private",
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
    async jwt({ token, account }) {
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
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).error = token.error;
      return session;
    },
  },
};
import SpotifyProvider from "next-auth/providers/spotify";
import type { AuthOptions } from "next-auth";
import { serverEnv } from "@/lib/env";
import { getFallbackMusicProviderId, isMusicProviderEnabled } from '@/lib/music-provider/enabledProviders';
import { logAuthEvent, startSession } from "@/lib/metrics";
import { getDb } from "@/lib/metrics/db";
import type { MusicProviderId } from '@/lib/music-provider/types';

const TOKEN_REFRESH_ERROR = 'RefreshAccessTokenError';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const FALLBACK_PROVIDER_ID = getFallbackMusicProviderId();
const TIDAL_AUTHORIZATION_URL = 'https://login.tidal.com/authorize';
const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
const TIDAL_USERINFO_URL = 'https://openapi.tidal.com/v2/users/me';
const TIDAL_SCOPES = 'r_usr w_usr user.read playlists.read playlists.write collection.read collection.write search.read';

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

function getProviderTokens(token: AuthJwtToken): ProviderTokenStore {
  const fromToken = token.musicProviderTokens ?? {};
  const spotifyToken = fromToken.spotify ?? {};
  const hasLegacySpotifyToken =
    typeof token.accessToken === 'string' ||
    typeof token.refreshToken === 'string' ||
    typeof token.accessTokenExpires === 'number';

  const mergedSpotifyToken: ProviderJwtToken = hasLegacySpotifyToken
    ? {
        ...spotifyToken,
        ...(typeof token.accessToken === 'string' ? { accessToken: token.accessToken } : {}),
        ...(typeof token.refreshToken === 'string' ? { refreshToken: token.refreshToken } : {}),
        ...(typeof token.accessTokenExpires === 'number' ? { accessTokenExpires: token.accessTokenExpires } : {}),
        ...(token.isByok ? { isByok: true } : {}),
        ...(token.byok ? { byok: token.byok } : {}),
      }
    : spotifyToken;

  const providerTokens: ProviderTokenStore = {
    ...fromToken,
  };

  if (Object.keys(mergedSpotifyToken).length > 0) {
    providerTokens.spotify = mergedSpotifyToken;
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

function createTidalAuthProvider() {
  if (!serverEnv.TIDAL_CLIENT_ID || !serverEnv.TIDAL_CLIENT_SECRET) {
    throw new Error('TIDAL provider enabled but TIDAL_CLIENT_ID/TIDAL_CLIENT_SECRET are missing');
  }

  return {
    id: 'tidal',
    name: 'TIDAL',
    type: 'oauth',
    clientId: serverEnv.TIDAL_CLIENT_ID,
    clientSecret: serverEnv.TIDAL_CLIENT_SECRET,
    authorization: {
      url: TIDAL_AUTHORIZATION_URL,
      params: {
        scope: TIDAL_SCOPES,
      },
    },
    token: {
      url: TIDAL_TOKEN_URL,
    },
    userinfo: {
      url: TIDAL_USERINFO_URL,
    },
    checks: ['pkce', 'state'],
    profile(profile: any) {
      const rawData = profile?.data ?? profile;
      const attributes = rawData?.attributes ?? {};
      const id = String(rawData?.id ?? '');
      const email = typeof attributes?.email === 'string' ? attributes.email : null;
      const username = typeof attributes?.username === 'string' ? attributes.username : null;

      return {
        id,
        name: username ?? email ?? 'TIDAL User',
        email,
        image: null,
      };
    },
  } as any;
}

const authProviders = [
  ...(isMusicProviderEnabled('spotify') ? [createSpotifyAuthProvider()] : []),
  ...(isMusicProviderEnabled('tidal') ? [createTidalAuthProvider()] : []),
];

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


function buildRefreshedSpotifyToken(token: ProviderJwtToken, data: any): ProviderJwtToken {
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const refreshToken = data.refresh_token ?? token.refreshToken;
  return {
    ...token,
    accessToken: data.access_token,
    accessTokenExpires: Date.now() + expiresInMs,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
    ...(token.isByok ? { isByok: true } : {}),
    ...(token.byok ? { byok: token.byok } : {}),
  };
}

/**
 * Refresh Spotify access token using the stored refresh token.
 * Supports both default credentials and BYOK (Bring Your Own Key) credentials.
 * Spotify docs: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
 */
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
  return {
    ...token,
    accessToken: data.access_token,
    accessTokenExpires: Date.now() + expiresInMs,
    ...(typeof refreshToken === 'string' ? { refreshToken } : {}),
  };
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
      const nextToken = token as AuthJwtToken;
      const providerTokens = getProviderTokens(nextToken);
      const providerErrors = {
        ...(nextToken.providerErrors ?? {}),
      } as Partial<Record<MusicProviderId, string | undefined>>;

      if (account) {
        const accountData = account as Record<string, any>;
        const providerId = toMusicProviderId(accountData.provider);
        if (providerId) {
          const previousToken = providerTokens[providerId] ?? {};
          const expiresAt = extractExpiresAt(accountData);
          providerTokens[providerId] = {
            ...previousToken,
            accessToken: accountData.access_token,
            refreshToken: accountData.refresh_token ?? previousToken.refreshToken,
            accessTokenExpires: expiresAt,
            ...(providerId === 'spotify'
              ? {
                  isByok: Boolean(nextToken.isByok ?? previousToken.isByok),
                  ...((nextToken.byok ?? previousToken.byok)
                    ? { byok: nextToken.byok ?? previousToken.byok }
                    : {}),
                }
              : {}),
          };
          providerErrors[providerId] = undefined;
        }
      }

      for (const providerId of Object.keys(providerTokens) as MusicProviderId[]) {
        const providerToken = providerTokens[providerId];
        if (!providerToken || !providerToken.accessToken) {
          continue;
        }

        if (!shouldRefreshProviderToken(providerToken)) {
          providerErrors[providerId] = providerErrors[providerId] ?? undefined;
          continue;
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

      const sessionProviderId = resolveSessionProviderId(providerTokens);
      const sessionProviderToken = sessionProviderId ? providerTokens[sessionProviderId] : undefined;
      const sessionError = sessionProviderId ? providerErrors[sessionProviderId] : undefined;

      return {
        ...nextToken,
        musicProviderTokens: providerTokens,
        providerErrors,
        accessToken: sessionProviderToken?.accessToken,
        refreshToken: sessionProviderToken?.refreshToken,
        accessTokenExpires: sessionProviderToken?.accessTokenExpires,
        error: sessionError,
        isByok: sessionProviderToken?.isByok || false,
        ...(sessionProviderToken?.byok ? { byok: sessionProviderToken.byok } : {}),
      };
    },

    /**
     * Expose accessToken and error state on the session for server-side fetchers.
     */
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
      
      // Add user info if available
      if (session.user) {
        if (typedToken.email) {
          session.user.email = typedToken.email;
        }
        // Add Spotify user ID from JWT sub (subject) claim
        if (typedToken.sub) {
          session.user.id = typedToken.sub;
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
        const trackedUserId = provider === 'spotify' && accessToken
          ? await fetchSpotifyUserId(accessToken, providerAccountId ?? '')
          : providerAccountId;

        console.debug("[auth] NextAuth signIn", {
          provider,
          providerAccountId,
          trackedUserId,
          user: debugUser,
        });

        if (trackedUserId) {
          logAuthEvent('login_success', trackedUserId);
          startSession(trackedUserId, userAgent);

          if (provider === 'spotify') {
            await linkUserToAccessRequest(getDb(), trackedUserId, email);
          }
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
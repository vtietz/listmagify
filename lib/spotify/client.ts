import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { withRateLimitRetry } from "@/lib/spotify/rateLimit";

/**
 * Build headers with bearer token from the NextAuth session.
 * Throws if token is missing — callers should ensure the user is authenticated.
 */
async function buildAuthHeaders(extra?: Record<string, string>): Promise<Headers> {
  const session = await getServerSession(authOptions);
  const headers = new Headers(extra ?? {});
  if (!session || !(session as any).accessToken) {
    throw new Error("Missing access token: user not authenticated");
  }
  headers.set("Authorization", `Bearer ${(session as any).accessToken}`);
  headers.set("Content-Type", "application/json");
  return headers;
}

/**
 * Build headers with a pre-provided bearer token.
 * Use this when you already have an access token (e.g., from requireAuth()).
 */
function buildAuthHeadersWithToken(token: string, extra?: Record<string, string>): Headers {
  const headers = new Headers(extra ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return headers;
}

export type SpotifyClientOptions = {
  baseUrl?: string;
  backoff?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
};

const DEFAULT_BASE = "https://api.spotify.com/v1";

/**
 * Low-level GET/POST wrapper that injects the access token and applies
 * rate-limit/backoff retry strategy. Returns raw Response.
 */
export async function spotifyFetch(
  path: string,
  init?: RequestInit,
  opts?: SpotifyClientOptions
): Promise<Response> {
  // In E2E mode, route to mock Spotify server
  const effectiveBase = process.env.E2E_MODE === '1' 
    ? (process.env.SPOTIFY_BASE_URL ?? 'http://spotify-mock:8080/v1')
    : DEFAULT_BASE;
  
  const base = opts?.baseUrl ?? effectiveBase;

  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = await buildAuthHeaders(init?.headers as Record<string, string> | undefined);

  const requestFactory = () =>
    fetch(url, {
      ...init,
      headers,
    });

  return withRateLimitRetry(requestFactory, opts?.backoff);
}

/**
 * Low-level GET/POST wrapper that uses a pre-provided access token.
 * Avoids an extra getServerSession() call when you already have the token.
 * Use with requireAuth() for reduced session fetch overhead.
 * 
 * Usage:
 * ```ts
 * const session = await requireAuth();
 * const res = await spotifyFetchWithToken(session.accessToken, '/me/playlists');
 * ```
 */
export async function spotifyFetchWithToken(
  accessToken: string,
  path: string,
  init?: RequestInit,
  opts?: SpotifyClientOptions
): Promise<Response> {
  // In E2E mode, route to mock Spotify server
  const effectiveBase = process.env.E2E_MODE === '1' 
    ? (process.env.SPOTIFY_BASE_URL ?? 'http://spotify-mock:8080/v1')
    : DEFAULT_BASE;
  
  const base = opts?.baseUrl ?? effectiveBase;

  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = buildAuthHeadersWithToken(accessToken, init?.headers as Record<string, string> | undefined);

  const requestFactory = () =>
    fetch(url, {
      ...init,
      headers,
    });

  return withRateLimitRetry(requestFactory, opts?.backoff);
}

/**
 * Convenience JSON-getter with typed generic.
 * Throws on non-2xx responses with a useful message.
 */
export async function getJSON<T>(
  path: string,
  opts?: SpotifyClientOptions
): Promise<T> {
  const res = await spotifyFetch(path, { method: "GET" }, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[spotify] GET ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json() as Promise<T>;
}
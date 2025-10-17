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
  const base = opts?.baseUrl ?? DEFAULT_BASE;

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
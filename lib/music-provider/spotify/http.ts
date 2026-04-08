import { getManagedSession } from '@/lib/auth/tokenManager';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import { ProviderApiError, type ProviderClientOptions } from '@/lib/music-provider/types';

export type SpotifyProviderDependencies = {
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<AuthenticatedSession>;
};

export const DEFAULT_PROVIDER_ID = 'spotify';
const DEFAULT_BASE = 'https://api.spotify.com/v1';
const REAL_SPOTIFY_HOSTS = new Set(['api.spotify.com', 'accounts.spotify.com']);

function getEffectiveBaseUrl(): string {
  if (process.env.E2E_MODE === '1') {
    return process.env.SPOTIFY_BASE_URL ?? 'http://spotify-mock:8080/v1';
  }

  return DEFAULT_BASE;
}

function getSafeRequestPath(path: string): string {
  try {
    if (path.startsWith('http')) {
      return new URL(path).pathname;
    }

    return path.split('?')[0] ?? path;
  } catch {
    return path.split('?')[0] ?? path;
  }
}

function buildUrl(path: string, baseUrl?: string): string {
  const resolvedUrl = path.startsWith('http')
    ? path
    : `${baseUrl ?? getEffectiveBaseUrl()}${path}`;

  if (process.env.E2E_MODE === '1') {
    try {
      const hostname = new URL(resolvedUrl).hostname;
      if (REAL_SPOTIFY_HOSTS.has(hostname)) {
        throw new Error(`[spotify] Real Spotify host is blocked in E2E mode: ${resolvedUrl}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('blocked in E2E mode')) {
        throw error;
      }
    }
  }

  return resolvedUrl;
}

function buildHeaders(token: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

export async function executeWithSession(
  path: string,
  init: RequestInit | undefined,
  opts: ProviderClientOptions | undefined,
  deps: Required<SpotifyProviderDependencies>
): Promise<Response> {
  const url = buildUrl(path, opts?.baseUrl);
  const safePath = getSafeRequestPath(path);

  const runAttempt = async (): Promise<Response> => {
    let session: AuthenticatedSession;
    try {
      session = await deps.getSession();
    } catch (error) {
      if (error instanceof ServerAuthError) {
        throw new ProviderApiError('Authentication required', 401, DEFAULT_PROVIDER_ID, error.reason);
      }

      throw error;
    }

    const headers = buildHeaders(session.accessToken, init?.headers);

    return withRateLimitRetry(
      () =>
        deps.fetchImpl(url, {
          ...init,
          headers,
        }),
      opts?.backoff,
      { requestPath: safePath, providerId: DEFAULT_PROVIDER_ID }
    );
  };

  const first = await runAttempt();
  if (first.status !== 401) {
    return first;
  }

  return runAttempt();
}

export async function executeWithAccessToken(
  accessToken: string,
  path: string,
  init?: RequestInit,
  opts?: ProviderClientOptions,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const url = buildUrl(path, opts?.baseUrl);
  const safePath = getSafeRequestPath(path);
  const headers = buildHeaders(accessToken, init?.headers);

  return withRateLimitRetry(
    () =>
      fetchImpl(url, {
        ...init,
        headers,
      }),
    opts?.backoff,
    { requestPath: safePath, providerId: DEFAULT_PROVIDER_ID }
  );
}

export async function readErrorText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}

export function throwProviderError(response: Response, details: string, operation: string): never {
  throw new ProviderApiError(
    `${operation} failed: ${response.status} ${response.statusText}`,
    response.status,
    DEFAULT_PROVIDER_ID,
    details
  );
}

export function resolveSpotifyDependencies(
  dependencies: SpotifyProviderDependencies,
): Required<SpotifyProviderDependencies> {
  return {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    getSession: dependencies.getSession ?? (() => getManagedSession('spotify')),
  };
}

import { getManagedSession } from '@/lib/auth/tokenManager';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import type { MusicProvider, ProviderClientOptions } from '@/lib/music-provider/types';

type SpotifyProviderDependencies = {
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<AuthenticatedSession>;
};

const DEFAULT_BASE = 'https://api.spotify.com/v1';

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
  if (path.startsWith('http')) {
    return path;
  }

  return `${baseUrl ?? getEffectiveBaseUrl()}${path}`;
}

function buildHeaders(token: string, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

async function executeWithSession(
  path: string,
  init: RequestInit | undefined,
  opts: ProviderClientOptions | undefined,
  deps: Required<SpotifyProviderDependencies>
): Promise<Response> {
  const url = buildUrl(path, opts?.baseUrl);
  const safePath = getSafeRequestPath(path);

  const runAttempt = async (): Promise<Response> => {
    const session = await deps.getSession();
    const headers = buildHeaders(session.accessToken, init?.headers);

    return withRateLimitRetry(
      () =>
        deps.fetchImpl(url, {
          ...init,
          headers,
        }),
      opts?.backoff,
      safePath
    );
  };

  const first = await runAttempt();
  if (first.status !== 401) {
    return first;
  }

  // Retry once after reacquiring session/token; handles short-lived race windows.
  return runAttempt();
}

async function executeWithAccessToken(
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
    safePath
  );
}

export function createSpotifyProvider(
  dependencies: SpotifyProviderDependencies = {}
): MusicProvider {
  const deps: Required<SpotifyProviderDependencies> = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    getSession: dependencies.getSession ?? getManagedSession,
  };

  return {
    async fetch(path: string, init?: RequestInit, opts?: ProviderClientOptions): Promise<Response> {
      return executeWithSession(path, init, opts, deps);
    },

    async fetchWithToken(
      accessToken: string,
      path: string,
      init?: RequestInit,
      opts?: ProviderClientOptions
    ): Promise<Response> {
      return executeWithAccessToken(accessToken, path, init, opts, deps.fetchImpl);
    },

    async getJSON<T>(path: string, opts?: ProviderClientOptions): Promise<T> {
      const response = await executeWithSession(path, { method: 'GET' }, opts, deps);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`[spotify] GET ${path} failed: ${response.status} ${response.statusText} ${text}`);
      }

      return response.json() as Promise<T>;
    },
  };
}

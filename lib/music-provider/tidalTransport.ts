import { getManagedSession } from '@/lib/auth/tokenManager';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import type { ProviderClientOptions } from '@/lib/music-provider/types';
import {
  extractPlaylistItemReferences,
  JSON_API_CONTENT_TYPE,
  type JsonApiDocument,
  type JsonApiIdentifier,
  type PlaylistItemReference,
} from '@/lib/music-provider/tidalProviderHelpers';

const DEFAULT_BASE = 'https://openapi.tidal.com/v2';

type InternalDependencies = {
  fetchImpl: typeof fetch;
  getSession: () => Promise<AuthenticatedSession>;
};

export type TidalProviderDependencies = {
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<AuthenticatedSession>;
};

function buildUrl(path: string, baseUrl?: string): string {
  if (path.startsWith('http')) {
    return path;
  }

  return `${baseUrl ?? DEFAULT_BASE}${path}`;
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

function buildHeaders(
  token: string,
  initHeaders?: HeadersInit,
  includeContentType = false,
): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', JSON_API_CONTENT_TYPE);
  if (includeContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', JSON_API_CONTENT_TYPE);
  }

  return headers;
}

function buildPathWithCursor(basePath: string, nextCursor?: string | null): string {
  return nextCursor ?? basePath;
}

export function createTidalTransport(dependencies: TidalProviderDependencies = {}) {
  const deps: InternalDependencies = {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    getSession: dependencies.getSession ?? (() => getManagedSession('tidal')),
  };

  async function executeWithSession(
    path: string,
    init: RequestInit | undefined,
    opts: ProviderClientOptions | undefined,
  ): Promise<Response> {
    const url = buildUrl(path, opts?.baseUrl);
    const safePath = getSafeRequestPath(path);

    const runAttempt = async (): Promise<Response> => {
      const session = await deps.getSession();
      const hasBody = init?.body !== undefined;
      const headers = buildHeaders(session.accessToken, init?.headers, hasBody);

      return withRateLimitRetry(
        () =>
          deps.fetchImpl(url, {
            ...init,
            headers,
          }),
        opts?.backoff,
        safePath,
      );
    };

    const first = await runAttempt();
    if (first.status !== 401) {
      return first;
    }

    return runAttempt();
  }

  async function executeWithAccessToken(
    accessToken: string,
    path: string,
    init?: RequestInit,
    opts?: ProviderClientOptions,
  ): Promise<Response> {
    const url = buildUrl(path, opts?.baseUrl);
    const safePath = getSafeRequestPath(path);
    const hasBody = init?.body !== undefined;
    const headers = buildHeaders(accessToken, init?.headers, hasBody);

    return withRateLimitRetry(
      () =>
        deps.fetchImpl(url, {
          ...init,
          headers,
        }),
      opts?.backoff,
      safePath,
    );
  }

  async function fetchPlaylistItemsPage(
    playlistId: string,
    nextCursor?: string | null,
  ): Promise<JsonApiDocument<JsonApiIdentifier[]>> {
    const encodedPlaylistId = encodeURIComponent(playlistId);
    const basePath = `/playlists/${encodedPlaylistId}/relationships/items?include=items`;
    const path = buildPathWithCursor(basePath, nextCursor);
    const response = await executeWithSession(path, { method: 'GET' }, undefined);

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`fetchPlaylistItemsPage failed: ${response.status} ${response.statusText} ${details}`);
    }

    return response.json() as Promise<JsonApiDocument<JsonApiIdentifier[]>>;
  }

  async function fetchAllPlaylistItemReferences(playlistId: string): Promise<PlaylistItemReference[]> {
    let nextCursor: string | null = null;
    const allReferences: PlaylistItemReference[] = [];

    do {
      const page = await fetchPlaylistItemsPage(playlistId, nextCursor);
      const pageReferences = extractPlaylistItemReferences(page);
      allReferences.push(...pageReferences);
      nextCursor = page.links?.next ?? null;
    } while (nextCursor);

    return allReferences;
  }

  return {
    executeWithSession,
    executeWithAccessToken,
    fetchPlaylistItemsPage,
    fetchAllPlaylistItemReferences,
  };
}

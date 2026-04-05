import { getManagedSession } from '@/lib/auth/tokenManager';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import { ProviderApiError, type ProviderClientOptions } from '@/lib/music-provider/types';
import { randomUUID } from 'node:crypto';
import {
  JSON_API_CONTENT_TYPE,
  type JsonApiDocument,
  type JsonApiIdentifier,
  type PlaylistItemReference,
} from '@/lib/music-provider/tidal/jsonApi';
import { extractPlaylistItemReferences } from '@/lib/music-provider/tidal/mappers';

const DEFAULT_BASE = 'https://openapi.tidal.com/v2';
const REAL_TIDAL_HOSTS = new Set(['openapi.tidal.com', 'auth.tidal.com', 'login.tidal.com']);

type InternalDependencies = {
  fetchImpl: typeof fetch;
  getSession: () => Promise<AuthenticatedSession>;
};

export type TidalProviderDependencies = {
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<AuthenticatedSession>;
};

function buildUrl(path: string, baseUrl?: string): string {
  const resolved = path.startsWith('http')
    ? path
    : `${baseUrl ?? getEffectiveBaseUrl()}${path}`;

  if (process.env.E2E_MODE === '1') {
    try {
      const hostname = new URL(resolved).hostname;
      if (REAL_TIDAL_HOSTS.has(hostname)) {
        throw new Error(`[tidal] Real TIDAL host is blocked in E2E mode: ${resolved}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('blocked in E2E mode')) {
        throw error;
      }
    }
  }

  return resolved;
}

function getEffectiveBaseUrl(): string {
  if (process.env.E2E_MODE === '1') {
    return process.env.TIDAL_BASE_URL ?? 'http://tidal-mock:8081/v2';
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

const MUTATION_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

function isMutationMethod(method: string | undefined): boolean {
  const normalized = (method ?? 'GET').toUpperCase();
  return MUTATION_METHODS.has(normalized);
}

function addMutationHeaders(headers: Headers, method: string | undefined): void {
  if (!isMutationMethod(method)) {
    return;
  }

  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', randomUUID());
  }
}

const TIDAL_PROVIDER_ID = 'tidal';

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
      let session: AuthenticatedSession;
      try {
        session = await deps.getSession();
      } catch (error) {
        if (error instanceof ServerAuthError) {
          throw new ProviderApiError('Authentication required', 401, TIDAL_PROVIDER_ID, error.reason);
        }

        throw error;
      }

      const hasBody = init?.body !== undefined;
      const headers = buildHeaders(session.accessToken, init?.headers, hasBody);
      addMutationHeaders(headers, init?.method);
      const requestInit: RequestInit = {
        ...init,
        headers,
      };

      return withRateLimitRetry(
        () =>
          deps.fetchImpl(url, {
            ...requestInit,
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
    addMutationHeaders(headers, init?.method);

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
    const basePath = `/playlists/${encodedPlaylistId}/relationships/items?include=items,items.artists,items.albums`;
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

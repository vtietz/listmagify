import { getManagedSession } from '@/lib/auth/tokenManager';
import { ServerAuthError } from '@/lib/auth/requireAuth';
import { withRateLimitRetry } from '@/lib/spotify/rateLimit';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';
import { ProviderApiError, type ProviderClientOptions } from '@/lib/music-provider/types';
import { createAPIClient } from '@tidal-music/api';
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

type SdkMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' | 'HEAD' | 'OPTIONS' | 'TRACE';

type SdkCredentialsProvider = Parameters<typeof createAPIClient>[0];

const SDK_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS', 'TRACE']);

function toSdkMethod(method: string | undefined): SdkMethod | null {
  const normalized = (method ?? 'GET').toUpperCase();
  return SDK_METHODS.has(normalized) ? (normalized as SdkMethod) : null;
}

function isRelativePath(path: string): boolean {
  return path.startsWith('/');
}

function shouldUseSdk(
  path: string,
  method: string | undefined,
  fetchImpl: typeof fetch,
): method is SdkMethod {
  const sdkMethod = toSdkMethod(method);
  if (!sdkMethod) {
    return false;
  }

  if (!isRelativePath(path)) {
    return false;
  }

  return fetchImpl === fetch;
}

function createSdkCredentialsProvider(accessToken: string): SdkCredentialsProvider {
  return {
    getCredentials: async () => ({ token: accessToken }),
  } as unknown as SdkCredentialsProvider;
}

function buildSdkRequestOptions(init: RequestInit): Record<string, unknown> {
  return {
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  };
}

async function executeWithSdk(
  accessToken: string,
  path: string,
  method: SdkMethod,
  init: RequestInit,
  baseUrl?: string,
): Promise<Response> {
  const client = createAPIClient(createSdkCredentialsProvider(accessToken), baseUrl ?? DEFAULT_BASE);
  const requestOptions = buildSdkRequestOptions(init);
  const result = await (client as any)[method](path, requestOptions);
  return result.response as Response;
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
      const requestInit: RequestInit = {
        ...init,
        headers,
      };

      if (shouldUseSdk(path, init?.method, deps.fetchImpl)) {
        return withRateLimitRetry(
          () => executeWithSdk(session.accessToken, path, (init?.method ?? 'GET').toUpperCase() as SdkMethod, requestInit, opts?.baseUrl),
          opts?.backoff,
          safePath,
        );
      }

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

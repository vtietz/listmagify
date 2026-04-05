import type { Playlist, PlaylistPageResult } from '@/lib/music-provider/types';
import {
  buildIncludedIndex,
  readJsonApiErrorDetails,
  type JsonApiDocument,
  type JsonApiIdentifier,
} from '@/lib/music-provider/tidal/jsonApi';
import { mapPlaylistResource } from '@/lib/music-provider/tidal/mappers';
import { throwProviderError } from '@/lib/music-provider/tidal/providerInternals';

const USER_PLAYLISTS_INCLUDE = 'items,items.owners,items.coverArt,items.collaborators';
const MAX_PAGES = 50;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function resolveCollectionTotal(raw: JsonApiDocument<unknown>, fallback: number): number {
  const topLevelMeta = raw as JsonApiDocument<unknown> & {
    meta?: {
      total?: unknown;
      totalNumberOfItems?: unknown;
      page?: {
        total?: unknown;
        totalNumberOfItems?: unknown;
      };
    };
  };

  return (
    asFiniteNumber(topLevelMeta.meta?.total)
    ?? asFiniteNumber(topLevelMeta.meta?.totalNumberOfItems)
    ?? asFiniteNumber(topLevelMeta.meta?.page?.total)
    ?? asFiniteNumber(topLevelMeta.meta?.page?.totalNumberOfItems)
    ?? fallback
  );
}

function buildUserPlaylistsPath(limit: number, offset = 0): string {
  return `/userCollectionPlaylists/me/relationships/items?include=${USER_PLAYLISTS_INCLUDE}&page[size]=${limit}&page[offset]=${offset}`;
}

function mapUserPlaylistsPage(raw: JsonApiDocument<JsonApiIdentifier[]>): {
  items: Playlist[];
  nextCursor: string | null;
  total: number;
} {
  const includedIndex = buildIncludedIndex(raw.included);
  const identifiers = Array.isArray(raw.data) ? raw.data : [];
  const items: Playlist[] = [];

  for (const identifier of identifiers) {
    if (identifier.type !== 'playlists') {
      continue;
    }

    const playlistResource = includedIndex.get(`${identifier.type}:${identifier.id}`);
    if (!playlistResource) {
      continue;
    }

    items.push(mapPlaylistResource(playlistResource, includedIndex));
  }

  return {
    items,
    nextCursor: raw.links?.next ?? null,
    total: resolveCollectionTotal(raw, items.length),
  };
}

export async function getUserPlaylistsPage(
  executeWithSession: (path: string, init: RequestInit | undefined, opts: undefined) => Promise<Response>,
  limit: number,
  nextCursor?: string | null,
): Promise<PlaylistPageResult<Playlist>> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);

  const fetchPage = createUserPlaylistsFetcher(executeWithSession);

  if (nextCursor) {
    return fetchPage(nextCursor);
  }

  return fetchAllUserPlaylists(boundedLimit, fetchPage);
}

function createUserPlaylistsFetcher(
  executeWithSession: (path: string, init: RequestInit | undefined, opts: undefined) => Promise<Response>,
): (path: string) => Promise<ReturnType<typeof mapUserPlaylistsPage>> {
  return async (path: string) => {
    const response = await executeWithSession(path, { method: 'GET' }, undefined);
    if (!response.ok) {
      throwProviderError(response, await readJsonApiErrorDetails(response), 'getUserPlaylists');
    }

    const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
    return mapUserPlaylistsPage(raw);
  };
}

async function fetchAllUserPlaylists(
  boundedLimit: number,
  fetchPage: (path: string) => Promise<ReturnType<typeof mapUserPlaylistsPage>>,
): Promise<PlaylistPageResult<Playlist>> {
  const seenPlaylistIds = new Set<string>();
  const seenCursors = new Set<string>();
  const aggregated: Playlist[] = [];
  let cursor: string | null = buildUserPlaylistsPath(boundedLimit, 0);
  let fallbackOffset = 0;
  let expectedTotal: number | null = null;
  let pageCount = 0;

  while (cursor && pageCount < MAX_PAGES && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);
    const page = await fetchPage(cursor);
    pageCount += 1;
    fallbackOffset += page.items.length;

    if (page.total > 0) {
      expectedTotal = Math.max(expectedTotal ?? 0, page.total);
    }

    let newItemsInPage = 0;
    for (const playlist of page.items) {
      if (seenPlaylistIds.has(playlist.id)) {
        continue;
      }

      seenPlaylistIds.add(playlist.id);
      aggregated.push(playlist);
      newItemsInPage += 1;
    }

    if (page.nextCursor) {
      cursor = page.nextCursor;
      continue;
    }

    // Some TIDAL environments cap page size (e.g. 20) without returning links.next.
    // Continue with explicit offset while pages still yield unseen playlists.
    if (page.items.length > 0 && newItemsInPage > 0) {
      cursor = buildUserPlaylistsPath(boundedLimit, fallbackOffset);
      continue;
    }

    cursor = null;
  }

  return {
    items: aggregated,
    nextCursor: null,
    total: Math.max(expectedTotal ?? 0, aggregated.length),
  };
}

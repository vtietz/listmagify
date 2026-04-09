import type { LikedTracksPageResult, Track } from '@/lib/music-provider/types';
import { readJsonApiErrorDetails, type JsonApiDocument, type JsonApiIdentifier } from '@/lib/music-provider/tidal/jsonApi';
import { mapTrackListDocument } from '@/lib/music-provider/tidal/mappers';
import { throwProviderError } from '@/lib/music-provider/tidal/providerInternals';

const USER_COLLECTION_TRACKS_INCLUDE = 'items,items.artists,items.albums';
const MAX_LIKED_TRACKS_PAGES = 500;

type ExecuteWithSession = (
  path: string,
  init: RequestInit | undefined,
  opts: undefined,
) => Promise<Response>;

function buildLikedTracksPath(limit: number, offset = 0): string {
  return `/userCollectionTracks/me/relationships/items?include=${USER_COLLECTION_TRACKS_INCLUDE}&page[size]=${limit}&page[offset]=${offset}`;
}

async function fetchLikedTracksPage(
  executeWithSession: ExecuteWithSession,
  path: string,
): Promise<LikedTracksPageResult<Track>> {
  const response = await executeWithSession(path, { method: 'GET' }, undefined);
  if (!response.ok) {
    throwProviderError(response, await readJsonApiErrorDetails(response), 'getLikedTracks');
  }

  const raw = (await response.json()) as JsonApiDocument<JsonApiIdentifier[]>;
  const page = mapTrackListDocument(raw);
  return { tracks: page.tracks, total: page.total, nextCursor: page.nextCursor };
}

async function fetchLikedTracksPageSafely(params: {
  executeWithSession: ExecuteWithSession;
  cursor: string;
  hasAggregatedTracks: boolean;
}): Promise<LikedTracksPageResult<Track> | null> {
  const { executeWithSession, cursor, hasAggregatedTracks } = params;

  try {
    return await fetchLikedTracksPage(executeWithSession, cursor);
  } catch (error) {
    if (!hasAggregatedTracks) {
      throw error;
    }

    console.warn('[tidal] getLikedTracks pagination stopped early, returning partial results', error);
    return null;
  }
}

function appendUniqueTracks(params: {
  aggregated: Track[];
  seenTrackIds: Set<string>;
  incoming: Track[];
}): number {
  const { aggregated, seenTrackIds, incoming } = params;
  let newTracksInPage = 0;

  for (const track of incoming) {
    const trackKey = track.id ?? track.uri;
    if (!trackKey || seenTrackIds.has(trackKey)) {
      continue;
    }

    seenTrackIds.add(trackKey);
    aggregated.push(track);
    newTracksInPage += 1;
  }

  return newTracksInPage;
}

function resolveNextCursor(params: {
  page: LikedTracksPageResult<Track>;
  newTracksInPage: number;
  fallbackOffset: number;
  limit: number;
}): string | null {
  const { page, newTracksInPage, fallbackOffset, limit } = params;

  if (page.nextCursor) {
    return page.nextCursor;
  }

  if (page.tracks.length > 0 && newTracksInPage > 0) {
    return buildLikedTracksPath(limit, fallbackOffset);
  }

  return null;
}

export async function getLikedTracksPage(
  executeWithSession: ExecuteWithSession,
  limit: number,
  nextCursor?: string | null,
): Promise<LikedTracksPageResult<Track>> {
  if (nextCursor) {
    return fetchLikedTracksPage(executeWithSession, nextCursor);
  }

  const seenTrackIds = new Set<string>();
  const seenCursors = new Set<string>();
  const aggregated: Track[] = [];
  let cursor: string | null = buildLikedTracksPath(limit, 0);
  let fallbackOffset = 0;
  let expectedTotal: number | null = null;
  let pageCount = 0;

  while (cursor && pageCount < MAX_LIKED_TRACKS_PAGES && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);

    const page = await fetchLikedTracksPageSafely({
      executeWithSession,
      cursor,
      hasAggregatedTracks: aggregated.length > 0,
    });
    if (!page) {
      break;
    }

    pageCount += 1;
    fallbackOffset += page.tracks.length;

    if (page.total > 0) {
      expectedTotal = Math.max(expectedTotal ?? 0, page.total);
    }

    const newTracksInPage = appendUniqueTracks({
      aggregated,
      seenTrackIds,
      incoming: page.tracks,
    });

    cursor = resolveNextCursor({
      page,
      newTracksInPage,
      fallbackOffset,
      limit,
    });
  }

  return {
    tracks: aggregated,
    total: Math.max(expectedTotal ?? 0, aggregated.length),
    nextCursor: null,
  };
}

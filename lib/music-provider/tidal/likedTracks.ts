import type { LikedTracksPageResult, Track } from '@/lib/music-provider/types';
import { readJsonApiErrorDetails, type JsonApiDocument, type JsonApiIdentifier } from '@/lib/music-provider/tidal/jsonApi';
import { mapTrackListDocument } from '@/lib/music-provider/tidal/mappers';
import { throwProviderError } from '@/lib/music-provider/tidal/providerInternals';

const USER_COLLECTION_TRACKS_INCLUDE = 'items,items.artists,items.albums';

type ExecuteWithSession = (
  path: string,
  init: RequestInit | undefined,
  opts: undefined,
) => Promise<Response>;

function buildLikedTracksPath(limit: number): string {
  const params = new URLSearchParams();
  params.set('include', USER_COLLECTION_TRACKS_INCLUDE);
  params.set('page[size]', String(limit));
  return `/userCollectionTracks/me/relationships/items?${params.toString()}`;
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

export async function getLikedTracksPage(
  executeWithSession: ExecuteWithSession,
  limit: number,
  nextCursor?: string | null,
): Promise<LikedTracksPageResult<Track>> {
  const path = nextCursor ?? buildLikedTracksPath(limit);
  return fetchLikedTracksPage(executeWithSession, path);
}

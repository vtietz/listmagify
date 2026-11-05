import { ProviderApiError } from '@/lib/music-provider/types';
import { readJsonApiErrorDetails, fromTrackUri, type JsonApiDocument, type JsonApiIdentifier } from '@/lib/music-provider/tidal/jsonApi';
import { createTidalTransport } from '@/lib/music-provider/tidal/transport';

export const DEFAULT_PROVIDER_ID = 'tidal';
export const PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE = 20;
export const NATIVE_REORDER_FALLBACK_STATUSES = new Set([404, 405, 501]);

export function isNativeReorderEnabled(): boolean {
  return process.env.TIDAL_NATIVE_REORDER === '1';
}

function isTidalReorderDebugEnabled(): boolean {
  return process.env.DEBUG_TIDAL_REORDER === '1';
}

export function unsupported(operation: string): never {
  throw new ProviderApiError(`${operation} is not supported for TIDAL`, 501, DEFAULT_PROVIDER_ID);
}

export function makeSnapshotId(): string {
  return `tidal-${Date.now()}`;
}

export function redactId(value: string): string {
  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function logReorderDebug(message: string, data: Record<string, unknown>): void {
  if (!isTidalReorderDebugEnabled()) {
    return;
  }

  console.debug(`[tidal-reorder] ${message}`, data);
}

export function throwProviderError(response: Response, details: string, operation: string): never {
  const normalizedDetails = details.trim() || response.statusText || 'Unknown provider error';
  throw new ProviderApiError(
    `${operation} failed: ${response.status} ${response.statusText}`,
    response.status,
    DEFAULT_PROVIDER_ID,
    normalizedDetails,
  );
}

export function toRelationArray(data: unknown): JsonApiIdentifier[] {
  if (!data) {
    return [];
  }

  return Array.isArray(data) ? data : [data as JsonApiIdentifier];
}

const USER_COLLECTION_TRACKS_PATH = '/userCollectionTracks/me/relationships/items?page[size]=100';
const MAX_USER_COLLECTION_PAGES = 500;

type SessionTransport = Pick<ReturnType<typeof createTidalTransport>, 'executeWithSession'>;

async function fetchUserCollectionTrackPage(
  transport: SessionTransport,
  path: string,
): Promise<JsonApiDocument<JsonApiIdentifier[]>> {
  const response = await transport.executeWithSession(path, { method: 'GET' }, undefined);
  if (!response.ok) {
    throwProviderError(response, await readJsonApiErrorDetails(response), 'containsTracks');
  }

  return response.json() as Promise<JsonApiDocument<JsonApiIdentifier[]>>;
}

export async function fetchAllUserCollectionTrackIds(transport: SessionTransport): Promise<Set<string>> {
  const trackIds = new Set<string>();
  let nextCursor: string | null = null;

  for (let page = 0; page < MAX_USER_COLLECTION_PAGES; page += 1) {
    const path = nextCursor ?? USER_COLLECTION_TRACKS_PATH;
    const raw = await fetchUserCollectionTrackPage(transport, path);
    const identifiers = Array.isArray(raw.data) ? raw.data : [];
    for (const identifier of identifiers) {
      if (identifier.type === 'tracks') {
        trackIds.add(identifier.id);
      }
    }

    nextCursor = raw.links?.next ?? null;
    if (!nextCursor) {
      break;
    }
  }

  return trackIds;
}

export function mapContainsTracksResult(inputIds: string[], foundIds: ReadonlySet<string>): boolean[] {
  return inputIds.map((id) => foundIds.has(fromTrackUri(id)));
}

export async function appendPlaylistTracks(
  transport: ReturnType<typeof createTidalTransport>,
  playlistId: string,
  trackIds: string[],
): Promise<void> {
  const path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;

  for (let i = 0; i < trackIds.length; i += PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE) {
    const batch = trackIds.slice(i, i + PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE);
    const response = await transport.executeWithSession(
      path,
      {
        method: 'POST',
        body: JSON.stringify({ data: batch.map((trackId) => ({ id: trackId, type: 'tracks' })) }),
      },
      undefined,
    );

    if (!response.ok) {
      throwProviderError(response, await readJsonApiErrorDetails(response), 'appendPlaylistTracks');
    }
  }
}

export async function deletePlaylistTrackItems(
  transport: ReturnType<typeof createTidalTransport>,
  playlistId: string,
  items: Array<{ id: string; type: 'tracks'; meta: { itemId: string } }>,
  operation: string,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;
  for (let i = 0; i < items.length; i += PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE) {
    const batch = items.slice(i, i + PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE);
    const response = await transport.executeWithSession(
      path,
      { method: 'DELETE', body: JSON.stringify({ data: batch }) },
      undefined,
    );

    if (!response.ok) {
      throwProviderError(response, await readJsonApiErrorDetails(response), operation);
    }
  }
}

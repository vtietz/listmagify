import {
  PlaylistPositionConflictError,
  ProviderApiError,
  type AddTracksPayload,
  type PositionedTrackRemoval,
} from '@/lib/music-provider/types';
import {
  DEFAULT_PROVIDER_ID,
  executeWithSession,
  readErrorText,
  throwProviderError,
  type SpotifyProviderDependencies,
} from '@/lib/music-provider/spotify/http';
import { PLAYLIST_ITEMS_PAGE_LIMIT, playlistItemsPath } from '@/lib/music-provider/spotify/mappers';

type ResolvedSpotifyDependencies = Required<SpotifyProviderDependencies>;

/** Max items per write request (add / replace / remove) on /playlists/{id}/items. */
const WRITE_BATCH_SIZE = 100;

/**
 * Fetches the URI of every playlist entry in order, keeping `null` for unavailable
 * entries so indices line up with playlist positions.
 */
export async function fetchPlaylistEntryUris(
  playlistId: string,
  deps: ResolvedSpotifyDependencies
): Promise<Array<string | null>> {
  const entries: Array<string | null> = [];
  const fields = encodeURIComponent('items(item(uri),track(uri)),total');
  let offset = 0;

  while (true) {
    const path = `${playlistItemsPath(playlistId)}?offset=${offset}&limit=${PLAYLIST_ITEMS_PAGE_LIMIT}&fields=${fields}`;
    const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

    if (!response.ok) {
      throwProviderError(response, await readErrorText(response), 'getPlaylistTrackUris');
    }

    const page = parseEntryPage(await response.json());
    entries.push(...page.uris);

    if (page.uris.length === 0 || entries.length >= (page.total ?? entries.length)) {
      break;
    }

    offset += page.uris.length;
  }

  return entries;
}

function entryUri(entry: any): string | null {
  const uri = entry?.item?.uri ?? entry?.track?.uri;
  return typeof uri === 'string' && uri.length > 0 ? uri : null;
}

function parseEntryPage(raw: any): { uris: Array<string | null>; total: number | null } {
  const items: unknown[] = Array.isArray(raw?.items) ? raw.items : [];
  return {
    uris: items.map(entryUri),
    total: typeof raw?.total === 'number' ? raw.total : null,
  };
}

/**
 * Fetches all track URIs for a playlist, paginating through results.
 */
export async function fetchPlaylistTrackUris(
  playlistId: string,
  deps: ResolvedSpotifyDependencies
): Promise<string[]> {
  const entries = await fetchPlaylistEntryUris(playlistId, deps);
  return entries.filter((uri): uri is string => uri !== null);
}

async function sendItemsRequest(
  playlistId: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: Record<string, unknown>,
  operation: string,
  deps: ResolvedSpotifyDependencies
): Promise<string | null> {
  const response = await executeWithSession(
    playlistItemsPath(playlistId),
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    undefined,
    deps
  );

  if (!response.ok) {
    throwProviderError(response, await readErrorText(response), operation);
  }

  const result = await response.json().catch(() => null);
  return typeof result?.snapshot_id === 'string' ? result.snapshot_id : null;
}

function requireSnapshot(snapshotId: string | null, operation: string): { snapshotId: string } {
  if (!snapshotId) {
    throw new ProviderApiError(`${operation} failed: missing snapshot_id`, 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
}

/**
 * Replaces all tracks in a playlist.
 * The first batch is written with PUT (replace) so the playlist is never left empty
 * between requests; remaining batches are appended.
 */
export async function batchReplacePlaylistTracks(
  playlistId: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  let snapshotId = await sendItemsRequest(
    playlistId,
    'PUT',
    { uris: trackUris.slice(0, WRITE_BATCH_SIZE) },
    'replacePlaylistTracks',
    deps
  );

  for (let i = WRITE_BATCH_SIZE; i < trackUris.length; i += WRITE_BATCH_SIZE) {
    const batch = trackUris.slice(i, i + WRITE_BATCH_SIZE);
    snapshotId = (await sendItemsRequest(playlistId, 'POST', { uris: batch }, 'replacePlaylistTracks', deps)) ?? snapshotId;
  }

  return requireSnapshot(snapshotId, 'replacePlaylistTracks');
}

/**
 * Removes all occurrences of the given track URIs in batches of 100.
 */
export async function batchRemovePlaylistTracks(
  playlistId: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  let snapshotId: string | null = null;

  for (let i = 0; i < trackUris.length; i += WRITE_BATCH_SIZE) {
    const batch = trackUris.slice(i, i + WRITE_BATCH_SIZE);
    snapshotId = (await sendItemsRequest(
      playlistId,
      'DELETE',
      { items: batch.map((uri) => ({ uri })) },
      'removePlaylistTracks',
      deps
    )) ?? snapshotId;
  }

  return requireSnapshot(snapshotId, 'removePlaylistTracks');
}

function collectRemovalPositions(
  entries: Array<string | null>,
  expected: PositionedTrackRemoval[]
): Set<number> {
  const positions = new Set<number>();

  for (const { uri, positions: trackPositions } of expected) {
    for (const position of trackPositions) {
      if (entries[position] !== uri) {
        throw new PlaylistPositionConflictError(DEFAULT_PROVIDER_ID);
      }
      positions.add(position);
    }
  }

  return positions;
}

type Reinsert = { position: number; uris: string[] };

/**
 * Groups kept occurrences into contiguous runs so each run is a single POST.
 * Runs are ascending by final position, which keeps every insert index valid.
 */
function buildReinsertRuns(remaining: Array<string | null>, deletedUris: Set<string>): Reinsert[] {
  const runs: Reinsert[] = [];

  remaining.forEach((uri, position) => {
    if (!uri || !deletedUris.has(uri)) {
      return;
    }

    const last = runs[runs.length - 1];
    if (last && last.position + last.uris.length === position && last.uris.length < WRITE_BATCH_SIZE) {
      last.uris.push(uri);
    } else {
      runs.push({ position, uris: [uri] });
    }
  });

  return runs;
}

/**
 * Removes specific playlist positions.
 *
 * Spotify can only delete by URI (all occurrences), so we delete the affected URIs
 * and re-insert just the occurrences that must stay. Every other entry keeps its
 * original added_at / added_by metadata.
 */
export async function removePlaylistTracksAtPositions(
  playlistId: string,
  expected: PositionedTrackRemoval[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  const entries = await fetchPlaylistEntryUris(playlistId, deps);
  const positions = collectRemovalPositions(entries, expected);

  const deletedUris = new Set<string>();
  positions.forEach((position) => deletedUris.add(entries[position] as string));

  const remaining = entries.filter((_, index) => !positions.has(index));
  const reinserts = buildReinsertRuns(remaining, deletedUris);

  let { snapshotId } = await batchRemovePlaylistTracks(playlistId, Array.from(deletedUris), deps);

  for (const run of reinserts) {
    snapshotId = (await sendItemsRequest(
      playlistId,
      'POST',
      { uris: run.uris, position: run.position },
      'removePlaylistTracksAtPositions',
      deps
    )) ?? snapshotId;
  }

  return { snapshotId };
}

/**
 * Adds tracks to a playlist in batches of 100, maintaining position tracking.
 */
export async function batchAddTracks(
  payload: AddTracksPayload,
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  let snapshotId: string | null = null;
  let currentPosition = payload.position;

  for (let i = 0; i < payload.trackUris.length; i += WRITE_BATCH_SIZE) {
    const batch = payload.trackUris.slice(i, i + WRITE_BATCH_SIZE);
    const requestBody = buildAddTracksRequestBody(batch, currentPosition, snapshotId ?? payload.snapshotId);

    if (typeof currentPosition === 'number') {
      currentPosition += batch.length;
    }

    snapshotId = (await sendItemsRequest(payload.playlistId, 'POST', requestBody, 'addTracks', deps)) ?? snapshotId;
  }

  return requireSnapshot(snapshotId, 'addTracks');
}

function buildAddTracksRequestBody(
  uris: string[],
  position: number | undefined,
  snapshotId: string | undefined
): Record<string, unknown> {
  const body: Record<string, unknown> = { uris };

  if (typeof position === 'number') {
    body.position = position;
  }

  if (snapshotId) {
    body.snapshot_id = snapshotId;
  }

  return body;
}

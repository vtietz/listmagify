import {
  ProviderApiError,
  type AddTracksPayload,
} from '@/lib/music-provider/types';
import {
  DEFAULT_PROVIDER_ID,
  executeWithSession,
  readErrorText,
  throwProviderError,
  type SpotifyProviderDependencies,
} from '@/lib/music-provider/spotify/http';

type ResolvedSpotifyDependencies = Required<SpotifyProviderDependencies>;

const BATCH_SIZE = 100;

/**
 * Fetches all track URIs for a playlist, paginating through results.
 */
export async function fetchPlaylistTrackUris(
  playlistId: string,
  deps: ResolvedSpotifyDependencies
): Promise<string[]> {
  const trackUris: string[] = [];
  let offset = 0;

  while (true) {
    const path = `/playlists/${encodeURIComponent(playlistId)}/tracks?offset=${offset}&limit=${BATCH_SIZE}&fields=items(track(uri)),total`;
    const response = await executeWithSession(path, { method: 'GET' }, undefined, deps);

    if (!response.ok) {
      throwProviderError(response, await readErrorText(response), 'getPlaylistTrackUris');
    }

    const raw = await response.json();
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const uris = items
      .map((item: any) => item?.track?.uri)
      .filter((uri: unknown): uri is string => typeof uri === 'string');
    trackUris.push(...uris);

    const total = typeof raw?.total === 'number' ? raw.total : trackUris.length;
    if (items.length < BATCH_SIZE || trackUris.length >= total) {
      break;
    }

    offset += BATCH_SIZE;
  }

  return trackUris;
}

/**
 * Replaces all tracks in a playlist. For >100 tracks, clears then adds in batches.
 */
export async function batchReplacePlaylistTracks(
  playlistId: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;

  if (trackUris.length <= BATCH_SIZE) {
    return replaceSmallPlaylist(path, trackUris, deps);
  }

  return clearAndRefillPlaylist(path, trackUris, deps);
}

async function replaceSmallPlaylist(
  path: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  const response = await executeWithSession(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: trackUris }),
    },
    undefined,
    deps
  );

  if (!response.ok) {
    throwProviderError(response, await readErrorText(response), 'replacePlaylistTracks');
  }

  const result = await response.json();
  const snapshotId = result?.snapshot_id;
  if (!snapshotId || typeof snapshotId !== 'string') {
    throw new ProviderApiError('replacePlaylistTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
}

async function clearAndRefillPlaylist(
  path: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  const clearResponse = await executeWithSession(
    path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [] }),
    },
    undefined,
    deps
  );

  if (!clearResponse.ok) {
    throwProviderError(clearResponse, await readErrorText(clearResponse), 'replacePlaylistTracks');
  }

  let snapshotId: string | null = null;
  for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
    const batch = trackUris.slice(i, i + BATCH_SIZE);
    const addResponse = await executeWithSession(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: batch }),
      },
      undefined,
      deps
    );

    if (!addResponse.ok) {
      throwProviderError(addResponse, await readErrorText(addResponse), 'replacePlaylistTracks');
    }

    const result = await addResponse.json();
    snapshotId = result?.snapshot_id ?? snapshotId;
  }

  if (!snapshotId) {
    throw new ProviderApiError('replacePlaylistTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
}

/**
 * Removes tracks from a playlist in batches of 100.
 */
export async function batchRemovePlaylistTracks(
  playlistId: string,
  trackUris: string[],
  deps: ResolvedSpotifyDependencies
): Promise<{ snapshotId: string }> {
  const path = `/playlists/${encodeURIComponent(playlistId)}/tracks`;
  let snapshotId: string | null = null;

  for (let i = 0; i < trackUris.length; i += BATCH_SIZE) {
    const batch = trackUris.slice(i, i + BATCH_SIZE);
    const response = await executeWithSession(
      path,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: batch.map((uri) => ({ uri })),
        }),
      },
      undefined,
      deps
    );

    if (!response.ok) {
      throwProviderError(response, await readErrorText(response), 'removePlaylistTracks');
    }

    const result = await response.json();
    snapshotId = result?.snapshot_id ?? snapshotId;
  }

  if (!snapshotId) {
    throw new ProviderApiError('removePlaylistTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
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
  const path = `/playlists/${encodeURIComponent(payload.playlistId)}/tracks`;
  let snapshotId: string | null = null;
  let currentPosition = payload.position;

  for (let i = 0; i < payload.trackUris.length; i += BATCH_SIZE) {
    const batch = payload.trackUris.slice(i, i + BATCH_SIZE);
    const requestBody = buildAddTracksRequestBody(batch, currentPosition, snapshotId ?? payload.snapshotId);

    if (typeof currentPosition === 'number') {
      currentPosition += batch.length;
    }

    const response = await executeWithSession(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      undefined,
      deps
    );

    if (!response.ok) {
      throwProviderError(response, await readErrorText(response), 'addTracks');
    }

    const result = await response.json();
    snapshotId = result?.snapshot_id ?? snapshotId;
  }

  if (!snapshotId) {
    throw new ProviderApiError('addTracks failed: missing snapshot_id', 500, DEFAULT_PROVIDER_ID);
  }

  return { snapshotId };
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

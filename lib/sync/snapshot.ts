import type { MusicProvider, MusicProviderId, Track } from '@/lib/music-provider/types';
import { fromProviderTrackBatch } from '@/lib/resolver/canonicalResolver';
import type { MappingConfidence, ResolveOptions, ResolveProviderTrackInput } from '@/lib/resolver/canonicalResolver';

export interface CanonicalSnapshotItem {
  canonicalTrackId: string;
  providerTrackId: string;
  matchScore: number;
  confidence: MappingConfidence;
  title: string;
  artists: string[];
  durationMs: number;
  position: number;
}

export interface PlaylistSnapshot {
  providerId: MusicProviderId;
  playlistId: string;
  snapshotId: string | null;
  items: CanonicalSnapshotItem[];
  trackCount: number;
}

const PAGE_SIZE = 100;

/**
 * Lightweight fetch to get only the playlist snapshot ID without loading
 * all tracks. Fetches a single-track page to extract the snapshotId.
 * Returns null if the provider doesn't support snapshot IDs (e.g. TIDAL).
 */
export async function fetchPlaylistSnapshotId(
  provider: MusicProvider,
  playlistId: string,
): Promise<string | null> {
  const page = await provider.getPlaylistTracks(playlistId, 1, null);
  return page.snapshotId;
}

/**
 * Paginate through all pages of a playlist, collecting every track
 * and the snapshotId from the first response.
 */
export async function fetchFullPlaylistTracks(
  provider: MusicProvider,
  playlistId: string,
): Promise<{ tracks: Track[]; snapshotId: string | null }> {
  const allTracks: Track[] = [];
  let cursor: string | null = null;
  let snapshotId: string | null = null;

  do {
    const page = await provider.getPlaylistTracks(playlistId, PAGE_SIZE, cursor);

    if (allTracks.length === 0) {
      snapshotId = page.snapshotId;
    }

    allTracks.push(...page.tracks);
    cursor = page.nextCursor;
  } while (cursor !== null);

  console.debug('[sync/snapshot] fetched full playlist tracks', {
    playlistId,
    trackCount: allTracks.length,
    snapshotId,
  });

  return { tracks: allTracks, snapshotId };
}

export interface SnapshotOptions {
  resolveOptions?: ResolveOptions;
}

/**
 * Map each provider track to a canonical ID and build an array of snapshot items.
 */
export function canonicalizeSnapshot(
  providerId: MusicProviderId,
  playlistId: string,
  tracks: Track[],
  snapshotId: string | null,
  options?: SnapshotOptions,
): PlaylistSnapshot {
  // Build batch input for all tracks at once
  const resolveInputs: ResolveProviderTrackInput[] = tracks.map((track) => ({
    provider: providerId,
    providerTrackId: track.id ?? track.uri,
    title: track.name,
    artists: track.artists,
    durationMs: track.durationMs,
    isrc: track.isrc ?? null,
  }));

  const mappings = fromProviderTrackBatch(resolveInputs, options?.resolveOptions);

  const items: CanonicalSnapshotItem[] = tracks.map((track, index) => {
    const mapping = mappings[index]!;
    return {
      canonicalTrackId: mapping.canonicalTrackId,
      providerTrackId: resolveInputs[index]!.providerTrackId,
      matchScore: mapping.matchScore,
      confidence: mapping.confidence,
      title: track.name,
      artists: track.artists,
      durationMs: track.durationMs,
      position: index,
    };
  });

  console.debug('[sync/snapshot] canonicalized snapshot', {
    providerId,
    playlistId,
    itemCount: items.length,
  });

  return {
    providerId,
    playlistId,
    snapshotId,
    items,
    trackCount: items.length,
  };
}

/**
 * Convenience: fetch all tracks for a playlist and build a canonical snapshot
 * in one call.
 */
export async function captureSnapshot(
  provider: MusicProvider,
  providerId: MusicProviderId,
  playlistId: string,
  options?: SnapshotOptions,
): Promise<PlaylistSnapshot> {
  const { tracks, snapshotId } = await fetchFullPlaylistTracks(provider, playlistId);
  return canonicalizeSnapshot(providerId, playlistId, tracks, snapshotId, options);
}

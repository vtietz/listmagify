import type { MusicProvider, MusicProviderId, Track } from '@/lib/music-provider/types';
import { fromProviderTrack } from '@/lib/resolver/canonicalResolver';
import type { MappingConfidence, ResolveOptions } from '@/lib/resolver/canonicalResolver';

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
  const items: CanonicalSnapshotItem[] = tracks.map((track, index) => {
    const providerTrackId = track.id ?? track.uri;

    const resolveInput = {
      provider: providerId,
      providerTrackId,
      title: track.name,
      artists: track.artists,
      durationMs: track.durationMs,
    };
    const mapping = options?.resolveOptions
      ? fromProviderTrack(resolveInput, options.resolveOptions)
      : fromProviderTrack(resolveInput);

    return {
      canonicalTrackId: mapping.canonicalTrackId,
      providerTrackId,
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

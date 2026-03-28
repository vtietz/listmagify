/**
 * Playlist capture module - captures playlist snapshots for building recommendation edges.
 * 
 * This module is responsible for:
 * - Capturing point-in-time snapshots of playlist track orders
 * - Storing track metadata in the tracks table
 * - Triggering edge updates after captures
 */

import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { unixNow, withTransaction } from "./db";
import { recsEnv } from './env';
import { updateAdjacencyEdgesFromPlaylist, updateCooccurrenceEdgesFromPlaylist } from "./edges";
import { fromProviderTrack } from '@/lib/resolver/canonicalResolver';

/**
 * Input for capturing a playlist snapshot.
 */
export interface PlaylistSnapshotInput {
  playlistId: string;
  tracks: Track[];
  provider: MusicProviderId;
  /**
   * If true, only update co-occurrence edges (skip adjacency).
   * Use for collections where order isn't meaningful (e.g., Liked Songs).
   */
  cooccurrenceOnly?: boolean;
}

function extractIsrc(track: Track): string | null {
  return track.isrc ?? null;
}

function extractAlbumUpc(track: Track): string | null {
  const maybeWithUpc = track.album as ({ upc?: string | null } & NonNullable<Track['album']>) | null | undefined;
  return maybeWithUpc?.upc ?? null;
}

function updateCanonicalEdgesFromPlaylist(
  canonicalTrackIds: string[],
  cooccurrenceWindow: number = 5,
): { sequentialEdges: number; cooccurrenceEdges: number } {
  if (canonicalTrackIds.length < 2) {
    return { sequentialEdges: 0, cooccurrenceEdges: 0 };
  }

  return withTransaction((db) => {
    let sequentialEdges = 0;
    let cooccurrenceEdges = 0;

    const upsertCanonicalEdge = db.prepare(`
      INSERT INTO rec_edges_canonical (
        src_canonical_track_id,
        dst_canonical_track_id,
        weight,
        type,
        created_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(src_canonical_track_id, dst_canonical_track_id, type) DO UPDATE SET
        weight = rec_edges_canonical.weight + excluded.weight,
        created_at = CURRENT_TIMESTAMP
    `);

    for (let i = 0; i < canonicalTrackIds.length - 1; i++) {
      const fromCanonical = canonicalTrackIds[i];
      const toCanonical = canonicalTrackIds[i + 1];
      if (!fromCanonical || !toCanonical || fromCanonical === toCanonical) continue;

      upsertCanonicalEdge.run(fromCanonical, toCanonical, 1, 'sequential');
      sequentialEdges += 1;
    }

    const seenPairs = new Set<string>();
    for (let i = 0; i < canonicalTrackIds.length; i++) {
      const source = canonicalTrackIds[i];
      if (!source) continue;

      for (let j = i + 1; j < Math.min(canonicalTrackIds.length, i + cooccurrenceWindow + 1); j++) {
        const target = canonicalTrackIds[j];
        if (!target || source === target) continue;

        const [left, right] = source < target ? [source, target] : [target, source];
        const pairKey = `${left}:${right}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const distance = j - i;
        const weight = Math.max(0.4, 1 - (distance - 1) * 0.1);
        upsertCanonicalEdge.run(left, right, weight, 'cooccur');
        cooccurrenceEdges += 1;
      }
    }

    return { sequentialEdges, cooccurrenceEdges };
  });
}

/**
 * Capture a snapshot of a playlist's current track order.
 * This stores the tracks and their positions, then updates edge weights.
 * 
 * Call this when:
 * - A playlist is first loaded
 * - After bulk operations complete (add/remove/reorder)
 * - Periodically to refresh stale data
 * 
 * @param input - The playlist ID and current track list
 * @returns Number of tracks captured
 */
export function captureSnapshot(input: PlaylistSnapshotInput): number {
  const { tracks } = input;
  const now = unixNow();
  
  if (tracks.length === 0) {
    return 0;
  }
  
  return withTransaction((db) => {
    // Upsert track metadata only (no snapshot storage to save space)
    const upsertTrack = db.prepare(`
      INSERT INTO tracks (track_id, uri, name, artist, artist_ids, album_id, popularity, duration_ms, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        uri = excluded.uri,
        name = excluded.name,
        artist = excluded.artist,
        artist_ids = excluded.artist_ids,
        album_id = excluded.album_id,
        popularity = COALESCE(excluded.popularity, tracks.popularity),
        duration_ms = excluded.duration_ms,
        updated_at = excluded.updated_at
    `);
    
    let capturedCount = 0;
    for (const track of tracks) {
      if (!track.id) continue; // Skip local files
      
      const artistIds = track.artistObjects?.map(a => a.id).filter(Boolean) ?? [];
      const artistNames = track.artistObjects?.map(a => a.name).filter(Boolean).join(', ') ?? '';
      
      upsertTrack.run(
        track.id,
        track.uri,
        track.name,
        artistNames,
        JSON.stringify(artistIds),
        track.album?.id ?? null,
        track.popularity ?? null,
        track.durationMs,
        now
      );
      capturedCount++;
    }
    
    return capturedCount;
  });
}

/**
 * Capture a playlist and update all edge types.
 * This is the main entry point for playlist ingestion.
 * 
 * @param input - The playlist ID and current track list
 * @returns Stats about the capture operation
 */
export function captureAndUpdateEdges(input: PlaylistSnapshotInput): {
  tracksCapture: number;
  adjacencyEdges: number;
  cooccurrenceEdges: number;
  canonicalMappedTracks?: number;
  canonicalAdjacencyEdges?: number;
  canonicalCooccurrenceEdges?: number;
} {
  // Capture snapshot first
  const tracksCapture = captureSnapshot(input);
  
  if (tracksCapture === 0) {
    return { tracksCapture: 0, adjacencyEdges: 0, cooccurrenceEdges: 0 };
  }
  
  // Extract track IDs for edge computation
  const trackIds = input.tracks
    .map(t => t.id)
    .filter((id): id is string => id !== null);
  
  // Update edges
  // Skip adjacency edges for collections where order isn't meaningful (e.g., Liked Songs)
  const adjacencyEdges = input.cooccurrenceOnly 
    ? 0 
    : updateAdjacencyEdgesFromPlaylist(trackIds);
  const cooccurrenceEdges = updateCooccurrenceEdgesFromPlaylist(trackIds);

  if (!recsEnv.RECS_CANONICAL_MODE) {
    return {
      tracksCapture,
      adjacencyEdges,
      cooccurrenceEdges,
    };
  }

  const canonicalTrackIds: string[] = [];
  for (const track of input.tracks) {
    if (!track.id) continue;

    const mapping = fromProviderTrack({
      provider: input.provider,
      providerTrackId: track.id,
      title: track.name,
      artists: track.artists,
      durationMs: track.durationMs,
      isrc: extractIsrc(track),
      albumUpc: extractAlbumUpc(track),
    });
    canonicalTrackIds.push(mapping.canonicalTrackId);
  }

  const canonicalEdges = updateCanonicalEdgesFromPlaylist(canonicalTrackIds);
  
  return {
    tracksCapture,
    adjacencyEdges,
    cooccurrenceEdges,
    canonicalMappedTracks: canonicalTrackIds.length,
    canonicalAdjacencyEdges: canonicalEdges.sequentialEdges,
    canonicalCooccurrenceEdges: canonicalEdges.cooccurrenceEdges,
  };
}



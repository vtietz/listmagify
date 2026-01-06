/**
 * Playlist capture module - captures playlist snapshots for building recommendation edges.
 * 
 * This module is responsible for:
 * - Capturing point-in-time snapshots of playlist track orders
 * - Storing track metadata in the tracks table
 * - Triggering edge updates after captures
 */

import type { Track } from "@/lib/spotify/types";
import { getRecsDb, unixNow, withTransaction } from "./db";
import { updateAdjacencyEdgesFromPlaylist, updateCooccurrenceEdgesFromPlaylist } from "./edges";

/**
 * Input for capturing a playlist snapshot.
 */
export interface PlaylistSnapshotInput {
  playlistId: string;
  tracks: Track[];
  /**
   * If true, only update co-occurrence edges (skip adjacency).
   * Use for collections where order isn't meaningful (e.g., Liked Songs).
   */
  cooccurrenceOnly?: boolean;
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
  
  return {
    tracksCapture,
    adjacencyEdges,
    cooccurrenceEdges,
  };
}



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
  const { playlistId, tracks } = input;
  const now = unixNow();
  
  if (tracks.length === 0) {
    return 0;
  }
  
  return withTransaction((db) => {
    // 1. Upsert track metadata
    const upsertTrack = db.prepare(`
      INSERT INTO tracks (track_id, uri, name, artist_ids, album_id, popularity, duration_ms, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        uri = excluded.uri,
        name = excluded.name,
        artist_ids = excluded.artist_ids,
        album_id = excluded.album_id,
        popularity = COALESCE(excluded.popularity, tracks.popularity),
        duration_ms = excluded.duration_ms,
        updated_at = excluded.updated_at
    `);
    
    for (const track of tracks) {
      if (!track.id) continue; // Skip local files
      
      const artistIds = track.artistObjects?.map(a => a.id).filter(Boolean) ?? [];
      
      upsertTrack.run(
        track.id,
        track.uri,
        track.name,
        JSON.stringify(artistIds),
        track.album?.id ?? null,
        track.popularity ?? null,
        track.durationMs,
        now
      );
    }
    
    // 2. Insert playlist track snapshot
    const insertPlaylistTrack = db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position, snapshot_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(playlist_id, track_id, snapshot_ts) DO UPDATE SET
        position = excluded.position
    `);
    
    let capturedCount = 0;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (!track?.id) continue;
      
      insertPlaylistTrack.run(playlistId, track.id, i, now);
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

/**
 * Get the latest snapshot timestamp for a playlist.
 */
export function getLatestSnapshotTimestamp(playlistId: string): number | null {
  const db = getRecsDb();
  const row = db.prepare(`
    SELECT MAX(snapshot_ts) as ts FROM playlist_tracks WHERE playlist_id = ?
  `).get(playlistId) as { ts: number | null } | undefined;
  
  return row?.ts ?? null;
}

/**
 * Check if a playlist needs a fresh snapshot based on age.
 * 
 * @param playlistId - The playlist ID
 * @param maxAgeSeconds - Maximum age before considered stale (default: 1 hour)
 */
export function isSnapshotStale(playlistId: string, maxAgeSeconds: number = 3600): boolean {
  const latestTs = getLatestSnapshotTimestamp(playlistId);
  
  if (latestTs === null) {
    return true; // No snapshot exists
  }
  
  const age = unixNow() - latestTs;
  return age > maxAgeSeconds;
}

/**
 * Get track IDs from the latest snapshot of a playlist.
 */
export function getLatestPlaylistTrackIds(playlistId: string): string[] {
  const db = getRecsDb();
  
  // Get the latest snapshot timestamp
  const latestTs = getLatestSnapshotTimestamp(playlistId);
  if (latestTs === null) {
    return [];
  }
  
  // Get track IDs at that snapshot
  const rows = db.prepare(`
    SELECT track_id FROM playlist_tracks 
    WHERE playlist_id = ? AND snapshot_ts = ?
    ORDER BY position ASC
  `).all(playlistId, latestTs) as Array<{ track_id: string }>;
  
  return rows.map(r => r.track_id);
}

/**
 * Remove old snapshots for a playlist, keeping only the most recent N.
 * This helps manage database size for frequently updated playlists.
 * 
 * @param playlistId - The playlist ID
 * @param keepCount - Number of recent snapshots to keep (default: 3)
 */
export function prunePlaylistSnapshots(playlistId: string, keepCount: number = 3): number {
  const db = getRecsDb();
  
  // Get distinct snapshot timestamps
  const timestamps = db.prepare(`
    SELECT DISTINCT snapshot_ts FROM playlist_tracks 
    WHERE playlist_id = ?
    ORDER BY snapshot_ts DESC
  `).all(playlistId) as Array<{ snapshot_ts: number }>;
  
  if (timestamps.length <= keepCount) {
    return 0;
  }
  
  // Delete all but the most recent N
  const cutoffTs = timestamps[keepCount - 1]?.snapshot_ts;
  if (cutoffTs === undefined) {
    return 0;
  }
  
  const result = db.prepare(`
    DELETE FROM playlist_tracks 
    WHERE playlist_id = ? AND snapshot_ts < ?
  `).run(playlistId, cutoffTs);
  
  return result.changes;
}

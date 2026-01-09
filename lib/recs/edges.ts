/**
 * Edge computation module for recommendation system.
 * 
 * Computes and maintains two types of edges:
 * 1. Sequential adjacency: directional edges based on track order (A -> B means B follows A)
 * 2. Co-occurrence: bidirectional edges for tracks appearing in the same playlist
 * 
 * Edges are weighted and decayed over time to give more importance to recent patterns.
 */

import { getRecsDb, unixNow, withTransaction } from "./db";
import { recsParams } from "./env";

/**
 * Update sequential adjacency edges for a playlist.
 * Creates edges between consecutive tracks (i -> i+1).
 * 
 * @param trackIds - Ordered array of track IDs in the playlist
 * @param weight - Weight to add for each edge (default: 1.0)
 * @returns Number of edges updated/created
 */
export function updateAdjacencyEdgesFromPlaylist(
  trackIds: string[],
  weight: number = 1.0
): number {
  if (trackIds.length < 2) {
    return 0;
  }
  
  const now = unixNow();
  const db = getRecsDb();
  
  return withTransaction(() => {
    const upsertEdge = db.prepare(`
      INSERT INTO track_edges_seq (from_track_id, to_track_id, weight_seq, last_seen_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_track_id, to_track_id) DO UPDATE SET
        weight_seq = track_edges_seq.weight_seq + excluded.weight_seq,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    let edgeCount = 0;
    
    // Create edges for consecutive pairs
    for (let i = 0; i < trackIds.length - 1; i++) {
      const fromTrack = trackIds[i];
      const toTrack = trackIds[i + 1];
      
      if (fromTrack && toTrack && fromTrack !== toTrack) {
        upsertEdge.run(fromTrack, toTrack, weight, now);
        edgeCount++;
      }
    }
    
    return edgeCount;
  });
}

/**
 * Update co-occurrence edges for a playlist.
 * Creates edges between all pairs of tracks within a sliding window.
 * 
 * @param trackIds - Array of track IDs in the playlist
 * @param window - Window size for co-occurrence (default: from config)
 * @param weight - Base weight for each co-occurrence (default: 1.0)
 * @returns Number of edges updated/created
 */
export function updateCooccurrenceEdgesFromPlaylist(
  trackIds: string[],
  window: number = recsParams.cooccurrenceWindow,
  weight: number = 1.0
): number {
  if (trackIds.length < 2) {
    return 0;
  }
  
  const now = unixNow();
  const db = getRecsDb();
  
  // Deduplicate track IDs while preserving order for window calculation
  const seen = new Set<string>();
  const uniqueTrackIds = trackIds.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  if (uniqueTrackIds.length < 2) {
    return 0;
  }
  
  return withTransaction(() => {
    // For co-occurrence, we ensure track_id_a < track_id_b to avoid duplicates
    const upsertEdge = db.prepare(`
      INSERT INTO track_cooccurrence (track_id_a, track_id_b, weight_co, last_seen_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(track_id_a, track_id_b) DO UPDATE SET
        weight_co = track_cooccurrence.weight_co + excluded.weight_co,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    let edgeCount = 0;
    const processedPairs = new Set<string>();
    
    // Use sliding window to find co-occurring pairs
    for (let i = 0; i < uniqueTrackIds.length; i++) {
      const trackA = uniqueTrackIds[i];
      if (!trackA) continue;
      
      // Look at tracks within the window
      for (let j = i + 1; j < Math.min(i + window + 1, uniqueTrackIds.length); j++) {
        const trackB = uniqueTrackIds[j];
        if (!trackB || trackA === trackB) continue;
        
        // Ensure consistent ordering (a < b)
        const [idA, idB] = trackA < trackB ? [trackA, trackB] : [trackB, trackA];
        
        // Skip if already processed
        const pairKey = `${idA}:${idB}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);
        
        // Weight decays slightly with distance
        const distance = j - i;
        const decayedWeight = weight * (1.0 - (distance - 1) * 0.1);
        
        upsertEdge.run(idA, idB, decayedWeight, now);
        edgeCount++;
      }
    }
    
    return edgeCount;
  });
}

/**
 * Incremental update for track additions.
 * More efficient than recapturing the entire playlist.
 * 
 * @param playlistTrackIds - Current track IDs in the playlist
 * @param addedTrackIds - IDs of newly added tracks
 * @param positions - Positions where tracks were added
 */
export function updateEdgesForAdd(
  playlistTrackIds: string[],
  addedTrackIds: string[],
  positions: number[]
): { adjacency: number; cooccurrence: number } {
  if (addedTrackIds.length === 0) {
    return { adjacency: 0, cooccurrence: 0 };
  }
  
  let adjacencyCount = 0;
  let cooccurrenceCount = 0;
  
  const now = unixNow();
  const db = getRecsDb();
  
  withTransaction(() => {
    const upsertSeq = db.prepare(`
      INSERT INTO track_edges_seq (from_track_id, to_track_id, weight_seq, last_seen_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_track_id, to_track_id) DO UPDATE SET
        weight_seq = track_edges_seq.weight_seq + excluded.weight_seq,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    // For each added track, create adjacency edges with neighbors
    for (let i = 0; i < addedTrackIds.length; i++) {
      const trackId = addedTrackIds[i];
      const position = positions[i];
      
      if (!trackId || position === undefined) continue;
      
      // Edge from previous track to this track
      if (position > 0) {
        const prevTrack = playlistTrackIds[position - 1];
        if (prevTrack && prevTrack !== trackId) {
          upsertSeq.run(prevTrack, trackId, 1.0, now);
          adjacencyCount++;
        }
      }
      
      // Edge from this track to next track
      if (position < playlistTrackIds.length - 1) {
        const nextTrack = playlistTrackIds[position + 1];
        if (nextTrack && nextTrack !== trackId) {
          upsertSeq.run(trackId, nextTrack, 1.0, now);
          adjacencyCount++;
        }
      }
    }
  });
  
  // Update co-occurrence for the affected region
  // Get a window around the affected positions
  const minPos = Math.max(0, Math.min(...positions) - recsParams.cooccurrenceWindow);
  const maxPos = Math.min(playlistTrackIds.length, Math.max(...positions) + recsParams.cooccurrenceWindow + 1);
  
  const windowTrackIds = playlistTrackIds.slice(minPos, maxPos);
  cooccurrenceCount = updateCooccurrenceEdgesFromPlaylist(windowTrackIds, recsParams.cooccurrenceWindow, 0.5);
  
  return { adjacency: adjacencyCount, cooccurrence: cooccurrenceCount };
}

/**
 * Incremental update for track removal.
 * Note: We don't remove edges, just update adjacency for new neighbors.
 * 
 * @param playlistTrackIds - Current track IDs AFTER removal
 * @param removedPositions - Original positions of removed tracks
 */
export function updateEdgesForRemove(
  playlistTrackIds: string[],
  removedPositions: number[]
): { adjacency: number } {
  if (removedPositions.length === 0 || playlistTrackIds.length < 2) {
    return { adjacency: 0 };
  }
  
  let adjacencyCount = 0;
  const now = unixNow();
  const db = getRecsDb();
  
  withTransaction(() => {
    const upsertSeq = db.prepare(`
      INSERT INTO track_edges_seq (from_track_id, to_track_id, weight_seq, last_seen_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_track_id, to_track_id) DO UPDATE SET
        weight_seq = track_edges_seq.weight_seq + excluded.weight_seq,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    // For each removal point, create edge between new neighbors
    // Adjust positions for cascading removals (sort descending)
    const sortedPositions = [...removedPositions].sort((a, b) => b - a);
    
    for (const originalPos of sortedPositions) {
      // After removal, the track at originalPos is the one that moved into place
      // We need to connect originalPos-1 -> originalPos (in the new array)
      const adjustedPos = Math.min(originalPos, playlistTrackIds.length - 1);
      
      if (adjustedPos > 0 && adjustedPos < playlistTrackIds.length) {
        const prevTrack = playlistTrackIds[adjustedPos - 1];
        const nextTrack = playlistTrackIds[adjustedPos];
        
        if (prevTrack && nextTrack && prevTrack !== nextTrack) {
          // Small weight since this is a "repair" edge, not an organic one
          upsertSeq.run(prevTrack, nextTrack, 0.5, now);
          adjacencyCount++;
        }
      }
    }
  });
  
  return { adjacency: adjacencyCount };
}

/**
 * Incremental update for track reordering.
 * Updates adjacency edges for the affected positions.
 * 
 * @param playlistTrackIds - Current track IDs after reordering
 * @param fromPosition - Original position of moved track
 * @param toPosition - New position of moved track
 */
export function updateEdgesForReorder(
  playlistTrackIds: string[],
  fromPosition: number,
  toPosition: number
): { adjacency: number } {
  if (fromPosition === toPosition || playlistTrackIds.length < 2) {
    return { adjacency: 0 };
  }
  
  let adjacencyCount = 0;
  const now = unixNow();
  const db = getRecsDb();
  
  withTransaction(() => {
    const upsertSeq = db.prepare(`
      INSERT INTO track_edges_seq (from_track_id, to_track_id, weight_seq, last_seen_ts)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(from_track_id, to_track_id) DO UPDATE SET
        weight_seq = track_edges_seq.weight_seq + excluded.weight_seq,
        last_seen_ts = excluded.last_seen_ts
    `);
    
    // Update edges around the new position
    const movedTrack = playlistTrackIds[toPosition];
    if (!movedTrack) return;
    
    // Edge from previous to moved track
    if (toPosition > 0) {
      const prevTrack = playlistTrackIds[toPosition - 1];
      if (prevTrack && prevTrack !== movedTrack) {
        upsertSeq.run(prevTrack, movedTrack, 1.0, now);
        adjacencyCount++;
      }
    }
    
    // Edge from moved track to next
    if (toPosition < playlistTrackIds.length - 1) {
      const nextTrack = playlistTrackIds[toPosition + 1];
      if (nextTrack && nextTrack !== movedTrack) {
        upsertSeq.run(movedTrack, nextTrack, 1.0, now);
        adjacencyCount++;
      }
    }
    
    // Also update the gap left at the old position
    // The tracks at fromPosition-1 and fromPosition are now adjacent (after shift)
    const minAffected = Math.min(fromPosition, toPosition);
    
    if (minAffected > 0 && minAffected < playlistTrackIds.length - 1) {
      const prevTrack = playlistTrackIds[minAffected - 1];
      const nextTrack = playlistTrackIds[minAffected];
      
      if (prevTrack && nextTrack && prevTrack !== nextTrack && prevTrack !== movedTrack && nextTrack !== movedTrack) {
        upsertSeq.run(prevTrack, nextTrack, 0.5, now);
        adjacencyCount++;
      }
    }
  });
  
  return { adjacency: adjacencyCount };
}

/**
 * Combined edge update for add/remove/reorder operations.
 * Use this when you want a single function to handle incremental updates.
 */
export function updateEdgesForAddRemoveReorder(params: {
  operation: 'add' | 'remove' | 'reorder';
  playlistTrackIds: string[];
  addedTrackIds?: string[];
  addPositions?: number[];
  removedPositions?: number[];
  fromPosition?: number;
  toPosition?: number;
}): { adjacency: number; cooccurrence: number } {
  const { operation } = params;
  
  switch (operation) {
    case 'add':
      return updateEdgesForAdd(
        params.playlistTrackIds,
        params.addedTrackIds ?? [],
        params.addPositions ?? []
      );
    
    case 'remove':
      return {
        ...updateEdgesForRemove(params.playlistTrackIds, params.removedPositions ?? []),
        cooccurrence: 0,
      };
    
    case 'reorder':
      return {
        ...updateEdgesForReorder(
          params.playlistTrackIds,
          params.fromPosition ?? 0,
          params.toPosition ?? 0
        ),
        cooccurrence: 0,
      };
    
    default:
      return { adjacency: 0, cooccurrence: 0 };
  }
}

/**
 * Get adjacency edges from a specific track.
 * Used for seed-based recommendations.
 * 
 * @param trackId - Source track ID
 * @param limit - Maximum edges to return
 */
export function getAdjacencyEdgesFrom(trackId: string, limit: number = 50): Array<{
  toTrackId: string;
  weight: number;
}> {
  const db = getRecsDb();
  
  const rows = db.prepare(`
    SELECT to_track_id, weight_seq
    FROM track_edges_seq
    WHERE from_track_id = ?
    ORDER BY weight_seq DESC
    LIMIT ?
  `).all(trackId, limit) as Array<{ to_track_id: string; weight_seq: number }>;
  
  return rows.map(r => ({
    toTrackId: r.to_track_id,
    weight: r.weight_seq,
  }));
}

/**
 * Get co-occurrence neighbors for a track.
 * 
 * @param trackId - Source track ID
 * @param limit - Maximum neighbors to return
 */
export function getCooccurrenceNeighbors(trackId: string, limit: number = 50): Array<{
  neighborId: string;
  weight: number;
}> {
  const db = getRecsDb();
  
  // Query both directions since co-occurrence is bidirectional
  const rows = db.prepare(`
    SELECT 
      CASE WHEN track_id_a = ? THEN track_id_b ELSE track_id_a END as neighbor_id,
      weight_co
    FROM track_cooccurrence
    WHERE track_id_a = ? OR track_id_b = ?
    ORDER BY weight_co DESC
    LIMIT ?
  `).all(trackId, trackId, trackId, limit) as Array<{ neighbor_id: string; weight_co: number }>;
  
  return rows.map(r => ({
    neighborId: r.neighbor_id,
    weight: r.weight_co,
  }));
}

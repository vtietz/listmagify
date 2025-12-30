/**
 * Recommendation System Maintenance Tasks
 * 
 * Run periodically (e.g., weekly via cron job or external scheduler) to:
 * - Decay edge weights (reduce importance of old data)
 * - Cap edges per track (prevent unbounded growth)
 * - Prune old snapshots (manage storage)
 * 
 * Usage:
 *   npx tsx cron/recs-maintenance.ts
 *   OR
 *   node --experimental-strip-types cron/recs-maintenance.ts
 */

import { getRecsDb, closeRecsDb, isRecsAvailable, unixNow, withTransaction } from '../lib/recs';
import { recsConfig } from '../lib/recs/env';

/**
 * Apply time-based decay to edge weights.
 * Reduces the weight of edges that haven't been seen recently.
 * 
 * @param factor - Decay multiplier (0.9-1.0, default from config)
 * @param olderThanDays - Only decay edges not seen in this many days
 * @returns Number of edges decayed
 */
export function decayEdgeWeights(
  factor: number = recsConfig.decayFactor,
  olderThanDays: number = 7
): { seqEdges: number; cooccurEdges: number; catalogEdges: number } {
  if (!isRecsAvailable()) {
    console.log('[recs-maintenance] Recommendations not enabled, skipping decay');
    return { seqEdges: 0, cooccurEdges: 0, catalogEdges: 0 };
  }

  const db = getRecsDb();
  const cutoffTs = unixNow() - (olderThanDays * 24 * 60 * 60);

  return withTransaction(() => {
    // Decay sequential edges
    const seqResult = db.prepare(`
      UPDATE track_edges_seq 
      SET weight_seq = weight_seq * ?
      WHERE last_seen_ts < ?
    `).run(factor, cutoffTs);

    // Decay co-occurrence edges
    const coResult = db.prepare(`
      UPDATE track_cooccurrence 
      SET weight_co = weight_co * ?
      WHERE last_seen_ts < ?
    `).run(factor, cutoffTs);

    // Decay catalog edges
    const catResult = db.prepare(`
      UPDATE track_catalog_edges 
      SET weight = weight * ?
      WHERE last_seen_ts < ?
    `).run(factor, cutoffTs);

    return {
      seqEdges: seqResult.changes,
      cooccurEdges: coResult.changes,
      catalogEdges: catResult.changes,
    };
  });
}

/**
 * Cap the number of outgoing edges per track.
 * Keeps only the top-K highest weighted edges.
 * 
 * @param maxEdgesPerTrack - Maximum edges to keep (default from config)
 * @returns Number of edges removed
 */
export function capTopKPerTrack(
  maxEdgesPerTrack: number = recsConfig.maxEdgesPerTrack
): { seqEdges: number; cooccurEdges: number } {
  if (!isRecsAvailable()) {
    console.log('[recs-maintenance] Recommendations not enabled, skipping cap');
    return { seqEdges: 0, cooccurEdges: 0 };
  }

  const db = getRecsDb();

  return withTransaction(() => {
    // Get tracks with too many sequential edges
    const seqOverflow = db.prepare(`
      SELECT from_track_id, COUNT(*) as cnt
      FROM track_edges_seq
      GROUP BY from_track_id
      HAVING cnt > ?
    `).all(maxEdgesPerTrack) as Array<{ from_track_id: string; cnt: number }>;

    let seqRemoved = 0;
    for (const row of seqOverflow) {
      // Keep only top K by weight
      const result = db.prepare(`
        DELETE FROM track_edges_seq
        WHERE from_track_id = ?
        AND rowid NOT IN (
          SELECT rowid FROM track_edges_seq
          WHERE from_track_id = ?
          ORDER BY weight_seq DESC
          LIMIT ?
        )
      `).run(row.from_track_id, row.from_track_id, maxEdgesPerTrack);
      seqRemoved += result.changes;
    }

    // Get tracks with too many co-occurrence edges (check both columns)
    const cooccurOverflowA = db.prepare(`
      SELECT track_id_a as track_id, COUNT(*) as cnt
      FROM track_cooccurrence
      GROUP BY track_id_a
      HAVING cnt > ?
    `).all(maxEdgesPerTrack) as Array<{ track_id: string; cnt: number }>;

    let cooccurRemoved = 0;
    for (const row of cooccurOverflowA) {
      const result = db.prepare(`
        DELETE FROM track_cooccurrence
        WHERE track_id_a = ?
        AND rowid NOT IN (
          SELECT rowid FROM track_cooccurrence
          WHERE track_id_a = ?
          ORDER BY weight_co DESC
          LIMIT ?
        )
      `).run(row.track_id, row.track_id, maxEdgesPerTrack);
      cooccurRemoved += result.changes;
    }

    return {
      seqEdges: seqRemoved,
      cooccurEdges: cooccurRemoved,
    };
  });
}

/**
 * Prune old playlist snapshots beyond the retention horizon.
 * 
 * @param retentionDays - Days to keep snapshots (default from config)
 * @returns Number of snapshot rows removed
 */
export function pruneOldSnapshots(
  retentionDays: number = recsConfig.snapshotRetentionDays
): number {
  if (!isRecsAvailable()) {
    console.log('[recs-maintenance] Recommendations not enabled, skipping prune');
    return 0;
  }

  const db = getRecsDb();
  const cutoffTs = unixNow() - (retentionDays * 24 * 60 * 60);

  const result = db.prepare(`
    DELETE FROM playlist_tracks WHERE snapshot_ts < ?
  `).run(cutoffTs);

  return result.changes;
}

/**
 * Remove edges with very low weights (effectively pruned by decay).
 * 
 * @param minWeight - Minimum weight threshold
 * @returns Number of edges removed
 */
export function pruneWeakEdges(minWeight: number = 0.01): {
  seqEdges: number;
  cooccurEdges: number;
  catalogEdges: number;
} {
  if (!isRecsAvailable()) {
    console.log('[recs-maintenance] Recommendations not enabled, skipping weak edge prune');
    return { seqEdges: 0, cooccurEdges: 0, catalogEdges: 0 };
  }

  const db = getRecsDb();

  return withTransaction(() => {
    const seqResult = db.prepare(`
      DELETE FROM track_edges_seq WHERE weight_seq < ?
    `).run(minWeight);

    const coResult = db.prepare(`
      DELETE FROM track_cooccurrence WHERE weight_co < ?
    `).run(minWeight);

    const catResult = db.prepare(`
      DELETE FROM track_catalog_edges WHERE weight < ?
    `).run(minWeight);

    return {
      seqEdges: seqResult.changes,
      cooccurEdges: coResult.changes,
      catalogEdges: catResult.changes,
    };
  });
}

/**
 * Run VACUUM to reclaim disk space after pruning.
 */
export function vacuum(): void {
  if (!isRecsAvailable()) {
    return;
  }

  const db = getRecsDb();
  db.exec('VACUUM');
}

/**
 * Get database statistics for monitoring.
 */
export function getStats(): {
  tracks: number;
  playlistSnapshots: number;
  seqEdges: number;
  cooccurEdges: number;
  catalogEdges: number;
  artistTopTracks: number;
  albumTracks: number;
  dbSizeBytes: number;
} {
  if (!isRecsAvailable()) {
    return {
      tracks: 0,
      playlistSnapshots: 0,
      seqEdges: 0,
      cooccurEdges: 0,
      catalogEdges: 0,
      artistTopTracks: 0,
      albumTracks: 0,
      dbSizeBytes: 0,
    };
  }

  const db = getRecsDb();

  const counts = {
    tracks: (db.prepare('SELECT COUNT(*) as cnt FROM tracks').get() as { cnt: number }).cnt,
    playlistSnapshots: (db.prepare('SELECT COUNT(*) as cnt FROM playlist_tracks').get() as { cnt: number }).cnt,
    seqEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_edges_seq').get() as { cnt: number }).cnt,
    cooccurEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_cooccurrence').get() as { cnt: number }).cnt,
    catalogEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_catalog_edges').get() as { cnt: number }).cnt,
    artistTopTracks: (db.prepare('SELECT COUNT(*) as cnt FROM artist_top_tracks').get() as { cnt: number }).cnt,
    albumTracks: (db.prepare('SELECT COUNT(*) as cnt FROM album_tracks').get() as { cnt: number }).cnt,
  };

  // Get database size
  const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
  const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
  const dbSizeBytes = pageCount * pageSize;

  return { ...counts, dbSizeBytes };
}

/**
 * Run all maintenance tasks.
 */
export async function runMaintenance(): Promise<void> {
  console.log('[recs-maintenance] Starting maintenance...');
  const startTime = Date.now();

  try {
    // Get initial stats
    const beforeStats = getStats();
    console.log('[recs-maintenance] Before stats:', beforeStats);

    // 1. Decay old edges
    console.log('[recs-maintenance] Decaying edge weights...');
    const decayResult = decayEdgeWeights();
    console.log('[recs-maintenance] Decayed:', decayResult);

    // 2. Cap edges per track
    console.log('[recs-maintenance] Capping edges per track...');
    const capResult = capTopKPerTrack();
    console.log('[recs-maintenance] Capped:', capResult);

    // 3. Prune old snapshots
    console.log('[recs-maintenance] Pruning old snapshots...');
    const pruneSnapshotsResult = pruneOldSnapshots();
    console.log('[recs-maintenance] Pruned snapshots:', pruneSnapshotsResult);

    // 4. Prune weak edges
    console.log('[recs-maintenance] Pruning weak edges...');
    const pruneWeakResult = pruneWeakEdges();
    console.log('[recs-maintenance] Pruned weak edges:', pruneWeakResult);

    // 5. Vacuum
    console.log('[recs-maintenance] Running VACUUM...');
    vacuum();

    // Get final stats
    const afterStats = getStats();
    console.log('[recs-maintenance] After stats:', afterStats);

    const duration = Date.now() - startTime;
    console.log(`[recs-maintenance] Completed in ${duration}ms`);

  } catch (error) {
    console.error('[recs-maintenance] Error:', error);
    throw error;
  } finally {
    closeRecsDb();
  }
}

// Run if executed directly
if (require.main === module) {
  runMaintenance()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

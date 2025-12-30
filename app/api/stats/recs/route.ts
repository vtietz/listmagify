import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isRecsAvailable, getRecsDb } from '@/lib/recs';

/**
 * GET /api/stats/recs
 * 
 * Returns recommendation system statistics.
 * Requires authenticated session (admin check done via middleware for stats routes).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if recs system is available
    if (!isRecsAvailable()) {
      return NextResponse.json({
        enabled: false,
        stats: null,
        message: 'Recommendation system is not enabled',
      });
    }

    const db = getRecsDb();

    // Core counts
    const stats = {
      // Track and edge counts
      tracks: (db.prepare('SELECT COUNT(*) as cnt FROM tracks').get() as { cnt: number }).cnt,
      playlistSnapshots: (db.prepare('SELECT COUNT(DISTINCT playlist_id || snapshot_ts) as cnt FROM playlist_tracks').get() as { cnt: number }).cnt,
      playlistsIndexed: (db.prepare('SELECT COUNT(DISTINCT playlist_id) as cnt FROM playlist_tracks').get() as { cnt: number }).cnt,
      seqEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_edges_seq').get() as { cnt: number }).cnt,
      cooccurEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_cooccurrence').get() as { cnt: number }).cnt,
      
      // Dismissals
      dismissedRecommendations: (db.prepare('SELECT COUNT(*) as cnt FROM dismissed_recommendations').get() as { cnt: number }).cnt,
    };

    // Get database size
    const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
    const dbSizeBytes = pageCount * pageSize;

    // Get some recent activity info
    const recentSnapshots = db.prepare(`
      SELECT COUNT(*) as cnt 
      FROM playlist_tracks 
      WHERE snapshot_ts > unixepoch() - 86400 * 7
    `).get() as { cnt: number };

    return NextResponse.json({
      enabled: true,
      stats: {
        ...stats,
        dbSizeBytes,
        dbSizeMB: (dbSizeBytes / (1024 * 1024)).toFixed(2),
        recentSnapshotsLast7Days: recentSnapshots.cnt,
        totalEdges: stats.seqEdges + stats.cooccurEdges,
      },
    });
  } catch (error) {
    console.error('[api/stats/recs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendation stats' },
      { status: 500 }
    );
  }
}

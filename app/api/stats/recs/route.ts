import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isRecsAvailable, getRecsDb } from '@/lib/recs';

interface TopTrack {
  trackId: string;
  name: string;
  artist: string | null;
  edgeCount: number;
}

/**
 * GET /api/stats/recs
 * 
 * Returns recommendation system statistics.
 * Requires authenticated session (admin check done via middleware for stats routes).
 * 
 * Query params:
 * - topTracksLimit: number of top tracks to return (default: 10)
 * - topTracksOffset: offset for pagination (default: 0)
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
        topTracks: [],
        totalTracks: 0,
        message: 'Recommendation system is not enabled',
      });
    }

    const db = getRecsDb();
    
    // Parse pagination params
    const searchParams = request.nextUrl.searchParams;
    const topTracksLimit = parseInt(searchParams.get('topTracksLimit') || '10', 10);
    const topTracksOffset = parseInt(searchParams.get('topTracksOffset') || '0', 10);

    // Core counts
    const stats = {
      // Track and edge counts
      tracks: (db.prepare('SELECT COUNT(*) as cnt FROM tracks').get() as { cnt: number }).cnt,
      seqEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_edges_seq').get() as { cnt: number }).cnt,
      cooccurEdges: (db.prepare('SELECT COUNT(*) as cnt FROM track_cooccurrence').get() as { cnt: number }).cnt,
      
      // Dismissals
      dismissedRecommendations: (db.prepare('SELECT COUNT(*) as cnt FROM dismissed_recommendations').get() as { cnt: number }).cnt,
    };

    // Get database size
    const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
    const dbSizeBytes = pageCount * pageSize;
    
    // Get top tracks by edge count (most connected tracks in the graph)
    const topTracks = db.prepare(`
      SELECT 
        t.track_id as trackId,
        t.name,
        t.artist,
        (
          (SELECT COUNT(*) FROM track_edges_seq WHERE from_track_id = t.track_id OR to_track_id = t.track_id) +
          (SELECT COUNT(*) FROM track_cooccurrence WHERE track_id_a = t.track_id OR track_id_b = t.track_id)
        ) as edgeCount
      FROM tracks t
      ORDER BY edgeCount DESC
      LIMIT ? OFFSET ?
    `).all(topTracksLimit, topTracksOffset) as TopTrack[];

    return NextResponse.json({
      enabled: true,
      stats: {
        ...stats,
        dbSizeBytes,
        dbSizeMB: (dbSizeBytes / (1024 * 1024)).toFixed(2),
        totalEdges: stats.seqEdges + stats.cooccurEdges,
      },
      topTracks,
      totalTracks: stats.tracks,
    });
  } catch (error) {
    console.error('[api/stats/recs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendation stats' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { 
  isRecsAvailable, 
  getSeedRecommendations, 
  type RecommendationContext 
} from '@/lib/recs';
import { fetchTracks } from '@/lib/spotify/catalog';
import type { Track } from '@/lib/spotify/types';

/**
 * POST /api/recs/seed
 * 
 * Get recommendations based on seed tracks.
 * Request body:
 * {
 *   seedTrackIds: string[],        // Required: 1-5 seed tracks
 *   excludeTrackIds?: string[],    // Optional: tracks to exclude (e.g., playlist tracks)
 *   playlistId?: string,           // Optional: for context-aware dismissals
 *   topN?: number,                 // Optional: max results (default: 20)
 *   includeMetadata?: boolean      // Optional: include full track metadata (default: true)
 * }
 * 
 * Response:
 * {
 *   recommendations: Array<{
 *     trackId: string,
 *     score: number,
 *     rank: number,
 *     track?: Track
 *   }>,
 *   enabled: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    // Check if recommendations are enabled
    if (!isRecsAvailable()) {
      return NextResponse.json({
        recommendations: [],
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const body = await request.json();
    const { 
      seedTrackIds, 
      excludeTrackIds = [], 
      playlistId,
      topN = 20,
      includeMetadata = true,
    } = body;

    // Validate input
    if (!Array.isArray(seedTrackIds) || seedTrackIds.length === 0) {
      return NextResponse.json(
        { error: 'seedTrackIds is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    if (seedTrackIds.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 seed tracks allowed' },
        { status: 400 }
      );
    }

    // Build recommendation context
    const context: RecommendationContext = {
      excludeTrackIds: new Set(excludeTrackIds),
      playlistId,
      topN: Math.min(Math.max(topN, 1), 50),
    };

    // Get recommendations
    const recommendations = getSeedRecommendations(seedTrackIds, context);

    // Optionally fetch full track metadata
    if (includeMetadata && recommendations.length > 0) {
      const trackIds = recommendations.map(r => r.trackId);
      const tracks = await fetchTracks(trackIds);
      const trackMap = new Map(tracks.map(t => [t.id, t]));

      for (const rec of recommendations) {
        const track = trackMap.get(rec.trackId);
        if (track) {
          rec.track = track;
        }
      }
    }

    return NextResponse.json({
      recommendations,
      enabled: true,
    });

  } catch (error) {
    console.error('[api/recs/seed] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recs/seed?seedTrackIds=id1,id2&excludeTrackIds=id3,id4&playlistId=xxx&topN=20
 * 
 * Alternative GET endpoint for simpler use cases.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if (!isRecsAvailable()) {
      return NextResponse.json({
        recommendations: [],
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const searchParams = request.nextUrl.searchParams;
    
    const seedTrackIds = searchParams.get('seedTrackIds')?.split(',').filter(Boolean) ?? [];
    const excludeTrackIds = searchParams.get('excludeTrackIds')?.split(',').filter(Boolean) ?? [];
    const playlistId = searchParams.get('playlistId') ?? undefined;
    const topN = parseInt(searchParams.get('topN') ?? '20', 10);
    const includeMetadata = searchParams.get('includeMetadata') !== 'false';

    if (seedTrackIds.length === 0) {
      return NextResponse.json({
        recommendations: [],
        enabled: true,
        message: 'No seed tracks provided',
      });
    }

    if (seedTrackIds.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 seed tracks allowed' },
        { status: 400 }
      );
    }

    const context: RecommendationContext = {
      excludeTrackIds: new Set(excludeTrackIds),
      playlistId,
      topN: Math.min(Math.max(topN, 1), 50),
    };

    const recommendations = getSeedRecommendations(seedTrackIds, context);

    if (includeMetadata && recommendations.length > 0) {
      const trackIds = recommendations.map(r => r.trackId);
      const tracks = await fetchTracks(trackIds);
      const trackMap = new Map(tracks.map(t => [t.id, t]));

      for (const rec of recommendations) {
        const track = trackMap.get(rec.trackId);
        if (track) {
          rec.track = track;
        }
      }
    }

    return NextResponse.json({
      recommendations,
      enabled: true,
    });

  } catch (error) {
    console.error('[api/recs/seed] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

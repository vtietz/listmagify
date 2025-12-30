import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { 
  isRecsAvailable, 
  getPlaylistAppendixRecommendations, 
  type RecommendationContext 
} from '@/lib/recs';
import { fetchTracks } from '@/lib/spotify/catalog';

/**
 * POST /api/recs/playlist-appendix
 * 
 * Get recommendations to append to a playlist.
 * Request body:
 * {
 *   playlistId: string,            // Required: playlist ID
 *   trackIds: string[],            // Required: current playlist track IDs
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

    if (!isRecsAvailable()) {
      return NextResponse.json({
        recommendations: [],
        enabled: false,
        message: 'Recommendation system is not enabled',
      });
    }

    const body = await request.json();
    const { 
      playlistId, 
      trackIds,
      topN = 20,
      includeMetadata = true,
    } = body;

    if (!playlistId || typeof playlistId !== 'string') {
      return NextResponse.json(
        { error: 'playlistId is required' },
        { status: 400 }
      );
    }

    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json({
        recommendations: [],
        enabled: true,
        message: 'trackIds is required - provide the current playlist tracks',
      });
    }

    // Build recommendation context
    const context: RecommendationContext = {
      excludeTrackIds: new Set(trackIds), // Exclude tracks already in playlist
      playlistId,
      topN: Math.min(Math.max(topN, 1), 50),
    };

    // Get recommendations
    const recommendations = getPlaylistAppendixRecommendations(trackIds, context);

    // Optionally fetch full track metadata
    if (includeMetadata && recommendations.length > 0) {
      const recTrackIds = recommendations.map(r => r.trackId);
      const tracks = await fetchTracks(recTrackIds);
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
    console.error('[api/recs/playlist-appendix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

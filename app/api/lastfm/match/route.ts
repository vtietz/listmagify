import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { spotifyFetch } from '@/lib/spotify/client';
import { mapPlaylistItemToTrack } from '@/lib/spotify/types';
import { isLastfmAvailable } from '@/lib/importers/lastfm';
import {
  buildSearchQuery,
  buildFallbackQuery,
  createMatchResult,
} from '@/lib/importers/spotifyMatcher';
import type { ImportedTrackDTO, SpotifyMatchedTrack, MatchResult } from '@/lib/importers/types';

/**
 * POST /api/lastfm/match
 * 
 * Match imported tracks to Spotify tracks.
 * Request body:
 * {
 *   tracks: ImportedTrackDTO[],  // Tracks to match
 *   limit?: number               // Max Spotify results per track (default 5)
 * }
 * 
 * Response:
 * {
 *   results: MatchResult[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    if ((session as any).error === 'RefreshAccessTokenError') {
      return NextResponse.json({ error: 'token_expired' }, { status: 401 });
    }

    // Check if Last.fm import is enabled
    if (!isLastfmAvailable()) {
      return NextResponse.json(
        { error: 'Last.fm import is not enabled', enabled: false },
        { status: 503 }
      );
    }

    const body = await request.json();
    const tracks: ImportedTrackDTO[] = body.tracks || [];
    const limit = Math.min(10, Math.max(1, body.limit || 5));

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json(
        { error: 'Tracks array is required' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent timeout
    const maxBatch = 20;
    const tracksToMatch = tracks.slice(0, maxBatch);

    // Match each track against Spotify
    const results: MatchResult[] = [];
    
    for (const track of tracksToMatch) {
      try {
        // Try precise search first
        let spotifyTracks = await searchSpotify(
          buildSearchQuery(track, true),
          limit
        );

        // Fallback to simpler query if no results
        if (spotifyTracks.length === 0) {
          spotifyTracks = await searchSpotify(
            buildSearchQuery(track, false),
            limit
          );
        }

        // Final fallback to plain text search
        if (spotifyTracks.length === 0) {
          spotifyTracks = await searchSpotify(
            buildFallbackQuery(track),
            limit
          );
        }

        const matchResult = createMatchResult(track, spotifyTracks);
        results.push(matchResult);
      } catch (error) {
        console.error('[api/lastfm/match] Search error for track:', track.trackName, error);
        // Add unmatched result
        results.push({
          imported: track,
          confidence: 'none',
          score: 0,
        });
      }
    }

    return NextResponse.json({
      results,
      matched: results.filter(r => r.confidence !== 'none').length,
      total: results.length,
    });
  } catch (error) {
    console.error('[api/lastfm/match] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Search Spotify for tracks
 */
async function searchSpotify(query: string, limit: number): Promise<SpotifyMatchedTrack[]> {
  const spotifyUrl = `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  
  const response = await spotifyFetch(spotifyUrl);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Search failed: ${response.status}`);
  }
  
  const data = await response.json();
  const items = data.tracks?.items || [];
  
  return items.map((item: any) => {
    const track = mapPlaylistItemToTrack({ track: item });
    return {
      id: track.id || '',
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      album: track.album ? {
        id: track.album.id,
        name: track.album.name,
      } : undefined,
      durationMs: track.durationMs,
      popularity: track.popularity || undefined,
    } as SpotifyMatchedTrack;
  });
}

/**
 * Stats User Profiles API - Fetches Spotify user profiles for display in stats.
 * 
 * POST /api/stats/user-profiles
 * Body: { userIds: string[] }
 * 
 * Returns display names and optionally emails (if STATS_SHOW_EMAILS=true).
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import { spotifyFetchWithToken } from '@/lib/spotify/client';
import { getMetricsConfig } from '@/lib/metrics/env';

function fallbackProfile(userId: string, showUserDetails: boolean): UserProfile {
  return {
    id: userId,
    displayName: userId,
    ...(showUserDetails ? { email: null } : {}),
  };
}

async function fetchUserProfile(accessToken: string, userId: string, showUserDetails: boolean): Promise<UserProfile> {
  if (!userId || typeof userId !== 'string') {
    return fallbackProfile(String(userId), showUserDetails);
  }

  try {
    const response = await spotifyFetchWithToken(accessToken, `/users/${encodeURIComponent(userId)}`);
    if (!response.ok) {
      return fallbackProfile(userId, showUserDetails);
    }

    const data = await response.json();
    return {
      id: userId,
      displayName: data.display_name || userId,
      ...(showUserDetails && data.email ? { email: data.email } : {}),
    };
  } catch {
    return fallbackProfile(userId, showUserDetails);
  }
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  email?: string | null; // Only included if STATS_SHOW_EMAILS=true
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    
    const body = await request.json().catch(() => ({}));
    const { userIds } = body;

    const config = getMetricsConfig();

    // Allow empty array for config check (just return showUserDetails setting)
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        showUserDetails: config.showUserDetails,
      });
    }

    // Limit to 50 user IDs per request
    if (userIds.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 user IDs per request' },
        { status: 400 }
      );
    }

    const profiles = await Promise.all(
      userIds
        .filter((userId: unknown): userId is string => typeof userId === 'string' && userId.length > 0)
        .map((userId: string) => fetchUserProfile(session.accessToken, userId, config.showUserDetails))
    );

    return NextResponse.json({
      success: true,
      data: profiles,
      showUserDetails: config.showUserDetails,
    });
  } catch (error) {
    console.error('[stats/user-profiles] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user profiles' },
      { status: 500 }
    );
  }
}

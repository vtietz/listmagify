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

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Limit to 50 user IDs per request
    if (userIds.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 user IDs per request' },
        { status: 400 }
      );
    }

    const config = getMetricsConfig();
    const profiles: UserProfile[] = [];

    // Fetch each user profile from Spotify API
    for (const userId of userIds) {
      if (!userId || typeof userId !== 'string') {
        continue;
      }

      try {
        const res = await spotifyFetchWithToken(
          session.accessToken,
          `/users/${encodeURIComponent(userId)}`
        );

        if (res.ok) {
          const data = await res.json();
          const profile: UserProfile = {
            id: userId,
            displayName: data.display_name || userId,
          };

          // Only include email if STATS_SHOW_EMAILS is enabled
          if (config.showEmails && data.email) {
            profile.email = data.email;
          }

          profiles.push(profile);
        } else {
          // If profile fetch fails, use user ID as display name
          profiles.push({
            id: userId,
            displayName: userId,
            ...(config.showEmails ? { email: null } : {}),
          });
        }
      } catch (error) {
        console.error(`[stats/user-profiles] Failed to fetch profile for ${userId}:`, error);
        // Add fallback entry
        profiles.push({
          id: userId,
          displayName: userId,
          ...(config.showEmails ? { email: null } : {}),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: profiles,
      showEmails: config.showEmails,
    });
  } catch (error) {
    console.error('[stats/user-profiles] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user profiles' },
      { status: 500 }
    );
  }
}

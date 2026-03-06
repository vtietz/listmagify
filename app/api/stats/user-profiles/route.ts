/**
 * Stats User Profiles API - Fetches provider user profiles for display in stats.
 * 
 * POST /api/stats/user-profiles
 * Body: { userIds: string[] }
 * 
 * Returns display names and optionally emails (if STATS_SHOW_EMAILS=true).
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import { resolveMusicProviderFromRequest } from '@/app/api/_shared/provider';
import { getMetricsConfig } from '@/lib/metrics/env';
import type { MusicProvider } from '@/lib/music-provider/types';

function fallbackProfile(userId: string, showUserDetails: boolean): UserProfile {
  return {
    id: userId,
    displayName: userId,
    ...(showUserDetails ? { email: null } : {}),
  };
}

async function fetchUserProfile(
  provider: MusicProvider,
  userId: string,
  showUserDetails: boolean
): Promise<UserProfile> {
  if (!userId || typeof userId !== 'string') {
    return fallbackProfile(String(userId), showUserDetails);
  }

  try {
    const data = await provider.getUserProfile(userId);
    return {
      id: userId,
      displayName: data.displayName || userId,
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
    await requireAuth();
    const { provider } = resolveMusicProviderFromRequest(request);
    
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
        .map((userId: string) => fetchUserProfile(provider, userId, config.showUserDetails))
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

/**
 * Stats Users API - Returns top users ranking.
 * 
 * GET /api/stats/users?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=10&offset=0&sortBy=eventCount&sortDirection=desc
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { getMetricsConfig, isUserAllowedForStats, getAllSessionUserIds } from '@/lib/metrics/env';
import { getTopUsers, getTotalUserCount, type UserSortField, type SortDirection } from '@/lib/metrics';
import type { MusicProviderId } from '@/lib/music-provider/types';

function parseProvider(value: string | null): MusicProviderId | undefined {
  if (value === 'spotify' || value === 'tidal') {
    return value;
  }

  return undefined;
}

function getDefaultDateRange() {
  const today = new Date().toISOString().split('T')[0]!;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  return { today, weekAgo };
}

function getUsersQueryParams(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { today, weekAgo } = getDefaultDateRange();
  const from = searchParams.get('from') || weekAgo;
  const to = searchParams.get('to') || today;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortBy = (searchParams.get('sortBy') || 'eventCount') as UserSortField;
  const sortDirection = (searchParams.get('sortDirection') || 'desc') as SortDirection;
  const config = getMetricsConfig();
  const provider = config.providerDimensionEnabled
    ? parseProvider(searchParams.get('provider'))
    : undefined;

  return { from, to, limit, offset, sortBy, sortDirection, config, provider };
}

export async function GET(request: NextRequest) {
  // Check authentication and authorization
  const session = await getServerSession(authOptions);
  if (!session || !isUserAllowedForStats(getAllSessionUserIds(session))) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  const { from, to, limit, offset, sortBy, sortDirection, config, provider } = getUsersQueryParams(request);

  try {
    const scopedRange = { from, to, ...(provider ? { provider } : {}) };
    const users = getTopUsers(scopedRange, limit, offset, sortBy, sortDirection);
    const totalUsers = getTotalUserCount(scopedRange);
    
    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        limit,
        offset,
        total: totalUsers,
        hasMore: offset + limit < totalUsers,
      },
      range: { from, to },
      sort: { sortBy, sortDirection },
      providerDimensionEnabled: config.providerDimensionEnabled,
    });
  } catch (error) {
    console.error('[stats/users] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch top users' },
      { status: 500 }
    );
  }
}

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
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getTopUsers, getTotalUserCount, type UserSortField, type SortDirection } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  // Check authentication and authorization
  const session = await getServerSession(authOptions);
  if (!session || !isUserAllowedForStats(session.user?.id)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  
  // Default to last 7 days if no range specified
  const today = new Date().toISOString().split('T')[0]!;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  
  const from = searchParams.get('from') || weekAgo;
  const to = searchParams.get('to') || today;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortBy = (searchParams.get('sortBy') || 'eventCount') as UserSortField;
  const sortDirection = (searchParams.get('sortDirection') || 'desc') as SortDirection;

  try {
    const users = getTopUsers({ from, to }, limit, offset, sortBy, sortDirection);
    const totalUsers = getTotalUserCount({ from, to });
    
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
    });
  } catch (error) {
    console.error('[stats/users] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch top users' },
      { status: 500 }
    );
  }
}

/**
 * Stats Overview API - Returns KPIs for the selected date range.
 * 
 * GET /api/stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getOverviewKPIs, getDatabaseStats } from '@/lib/metrics';

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

  try {
    const kpis = getOverviewKPIs({ from, to });
    const dbStats = getDatabaseStats();
    
    return NextResponse.json({
      success: true,
      data: kpis,
      dbStats: dbStats || undefined, // Include DB stats if available
      range: { from, to },
    });
  } catch (error) {
    console.error('[stats/overview] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch overview data' },
      { status: 500 }
    );
  }
}

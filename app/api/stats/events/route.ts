/**
 * Stats Events API - Returns event data for charts.
 * 
 * GET /api/stats/events?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Returns:
 * - Daily summaries with event breakdown
 * - Event counts by type
 * - Action distribution
 * - Daily users
 * - Daily actions
 * 
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailySummaries, getActionDistribution, getTopPlaylists, getDailyUsers, getDailyActions } from '@/lib/metrics';
import { logPageView } from '@/lib/metrics';
import { getToken } from 'next-auth/jwt';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Default to last 7 days if no range specified
  const today = new Date().toISOString().split('T')[0]!;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  
  const from = searchParams.get('from') || weekAgo;
  const to = searchParams.get('to') || today;

  try {
    const [dailySummaries, actionDistribution, topPlaylists, dailyUsers, dailyActions] = await Promise.all([
      getDailySummaries({ from, to }),
      getActionDistribution({ from, to }),
      getTopPlaylists({ from, to }, 10),
      getDailyUsers({ from, to }),
      getDailyActions({ from, to }),
    ]);
    
    return NextResponse.json({
      success: true,
      data: {
        dailySummaries,
        actionDistribution,
        topPlaylists,
        dailyUsers,
        dailyActions,
      },
      range: { from, to },
    });
  } catch (error) {
    console.error('[stats/events] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch events data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stats/events - Record a UI event (page view)
 * 
 * Body: { route: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { route } = body;

    if (!route || typeof route !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid route' },
        { status: 400 }
      );
    }

    // Get user ID from token if available
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET! });
    const userId = (token as any)?.sub;

    logPageView(userId, route);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[stats/events] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record event' },
      { status: 500 }
    );
  }
}

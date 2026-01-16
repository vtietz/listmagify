/**
 * Traffic Analytics Stats API
 * 
 * Returns aggregated traffic data for the stats dashboard.
 * GET /api/stats/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getTrafficStats } from '@/lib/metrics/traffic';

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check stats access
    const userId = session.user?.id;
    if (!isUserAllowedForStats(userId)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get query params
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    // Get traffic stats
    const stats = getTrafficStats(from, to);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[API] Traffic stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

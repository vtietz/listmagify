/**
 * Stats Authentication API - Returns login success/failure stats.
 * 
 * GET /api/stats/auth?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getAuthStats } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  // Check authentication and authorization
  const session = await getServerSession(authOptions);
  if (!session || !isUserAllowedForStats(session.user?.id)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '2020-01-01';
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0]!;

    const authStats = getAuthStats({ from, to });

    return NextResponse.json({
      success: true,
      data: authStats,
    });
  } catch (error) {
    console.error('[stats/auth] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch authentication stats' },
      { status: 500 }
    );
  }
}

/**
 * Stats Overview API - Returns KPIs for the selected date range.
 * 
 * GET /api/stats/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOverviewKPIs } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Default to last 7 days if no range specified
  const today = new Date().toISOString().split('T')[0]!;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  
  const from = searchParams.get('from') || weekAgo;
  const to = searchParams.get('to') || today;

  try {
    const kpis = getOverviewKPIs({ from, to });
    
    return NextResponse.json({
      success: true,
      data: kpis,
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

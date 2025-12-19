/**
 * Stats Sessions API - Returns session data for the dashboard.
 * 
 * GET /api/stats/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Returns:
 * - Sessions by day with active users and avg duration
 * 
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionsByDay } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Default to last 7 days if no range specified
  const today = new Date().toISOString().split('T')[0]!;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  
  const from = searchParams.get('from') || weekAgo;
  const to = searchParams.get('to') || today;

  try {
    const sessionsByDay = getSessionsByDay({ from, to });
    
    return NextResponse.json({
      success: true,
      data: {
        sessionsByDay,
      },
      range: { from, to },
    });
  } catch (error) {
    console.error('[stats/sessions] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sessions data' },
      { status: 500 }
    );
  }
}

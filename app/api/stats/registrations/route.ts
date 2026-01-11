/**
 * User registrations stats endpoint
 * 
 * Protected by middleware (STATS_ALLOWED_USER_IDS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRegisteredUsersPerDay } from '@/lib/metrics';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || '2020-01-01';
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0]!;

    const registrations = getRegisteredUsersPerDay({ from, to });

    return NextResponse.json({
      success: true,
      data: registrations,
    });
  } catch (error) {
    console.error('[stats/registrations] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch registration stats' },
      { status: 500 }
    );
  }
}

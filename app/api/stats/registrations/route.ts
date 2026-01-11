/**
 * User registrations stats endpoint
 * 
 * Protected by STATS_ALLOWED_USER_IDS check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getRegisteredUsersPerDay } from '@/lib/metrics';

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

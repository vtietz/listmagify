/**
 * Debug endpoint to show the current user's Spotify ID.
 * Use this to find the correct ID for STATS_ALLOWED_USER_IDS.
 * 
 * GET /api/debug/whoami
 */

import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET! 
  });

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Show all relevant IDs from the token
  return NextResponse.json({
    message: 'Use one of these IDs for STATS_ALLOWED_USER_IDS',
    sub: (token as any).sub,
    providerAccountId: (token as any).providerAccountId,
    email: (token as any).email,
    name: (token as any).name,
    // Show which one is being used
    usedForStatsCheck: (token as any).sub || (token as any).providerAccountId,
    currentAllowlist: process.env.STATS_ALLOWED_USER_IDS,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stats/error-reports/resolve-all
 * 
 * Marks all unresolved error reports as resolved within the specified date range.
 * Protected by STATS_ALLOWED_USER_IDS check.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isUserAllowedForStats(session.user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Stats not enabled' }, { status: 503 });
    }

    const body = await request.json();
    const { from, to } = body;

    let query = `UPDATE error_reports SET resolved = 1 WHERE resolved = 0`;
    const params: string[] = [];

    if (from) {
      query += ` AND DATE(ts) >= ?`;
      params.push(from);
    }

    if (to) {
      query += ` AND DATE(ts) <= ?`;
      params.push(to);
    }

    const result = db.prepare(query).run(...params);

    return NextResponse.json({
      success: true,
      updated: result.changes || 0,
    });
  } catch (error) {
    console.error('[api/stats/error-reports/resolve-all] Error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve error reports' },
      { status: 500 }
    );
  }
}

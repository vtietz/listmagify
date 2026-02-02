import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats/access-requests-timeline
 * 
 * Returns access requests grouped by day with counts by status.
 * Protected by STATS_ALLOWED_USER_IDS check.
 */
export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = `
      SELECT 
        DATE(ts) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM access_requests
      WHERE 1=1
    `;
    const params: string[] = [];

    if (from) {
      query += ` AND DATE(ts) >= ?`;
      params.push(from);
    }

    if (to) {
      query += ` AND DATE(ts) <= ?`;
      params.push(to);
    }

    query += ` GROUP BY DATE(ts) ORDER BY DATE(ts) ASC`;

    const data = db.prepare(query).all(...params) as Array<{
      date: string;
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    }>;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[stats] Error fetching access requests timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access requests timeline' },
      { status: 500 }
    );
  }
}

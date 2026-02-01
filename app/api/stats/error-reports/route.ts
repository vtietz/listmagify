import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats/error-reports
 * 
 * Fetches error reports for the stats dashboard.
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const resolved = searchParams.get('resolved'); // null = all, 'true' = resolved only, 'false' = unresolved only
    const search = searchParams.get('search'); // search across error_message, error_category, user_name

    let query = `
      SELECT 
        id, report_id, ts, user_id, user_name, user_hash,
        error_category, error_severity, error_message, error_details,
        error_status_code, error_request_path, user_description,
        environment_json, app_version, resolved
      FROM error_reports
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (from) {
      query += ` AND DATE(ts) >= ?`;
      params.push(from);
    }

    if (to) {
      query += ` AND DATE(ts) <= ?`;
      params.push(to);
    }

    if (resolved === 'true') {
      query += ` AND resolved = 1`;
    } else if (resolved === 'false') {
      query += ` AND resolved = 0`;
    }

    if (search) {
      query += ` AND (error_message LIKE ? OR error_category LIKE ? OR user_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Get total count using a simple count query with the same WHERE clause
    let countQuery = `SELECT COUNT(*) as total FROM error_reports WHERE 1=1`;
    const countParams: (string | number)[] = [];
    
    if (from) {
      countQuery += ` AND DATE(ts) >= ?`;
      countParams.push(from);
    }
    if (to) {
      countQuery += ` AND DATE(ts) <= ?`;
      countParams.push(to);
    }
    if (resolved === 'true') {
      countQuery += ` AND resolved = 1`;
    } else if (resolved === 'false') {
      countQuery += ` AND resolved = 0`;
    }
    if (search) {
      countQuery += ` AND (error_message LIKE ? OR error_category LIKE ? OR user_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;

    // Add ordering and pagination
    query += ` ORDER BY ts DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const reports = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      data: reports,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('[stats] Error fetching error reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch error reports' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/stats/error-reports
 * 
 * Updates error report status (e.g., mark as resolved).
 */
export async function PATCH(request: NextRequest) {
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
    const { reportId, resolved } = body;

    if (!reportId || typeof resolved !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    db.prepare(`
      UPDATE error_reports
      SET resolved = ?
      WHERE report_id = ?
    `).run(resolved ? 1 : 0, reportId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[stats] Error updating error report:', error);
    return NextResponse.json(
      { error: 'Failed to update error report' },
      { status: 500 }
    );
  }
}

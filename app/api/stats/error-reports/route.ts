import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';
import { routeErrors, isAppRouteError } from '@/lib/errors';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  resolved: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
});

function parseQuery(searchParams: URLSearchParams) {
  const parsed = querySchema.safeParse({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    limit: searchParams.get('limit') ?? '50',
    offset: searchParams.get('offset') ?? '0',
    resolved: searchParams.get('resolved') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });

  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid query');
  }

  return parsed.data;
}

function appendCommonFilters(
  query: string,
  params: (string | number)[],
  filters: ReturnType<typeof parseQuery>
) {
  let result = query;

  if (filters.from) {
    result += ` AND DATE(ts) >= ?`;
    params.push(filters.from);
  }

  if (filters.to) {
    result += ` AND DATE(ts) <= ?`;
    params.push(filters.to);
  }

  if (filters.resolved === 'true') {
    result += ` AND resolved = 1`;
  } else if (filters.resolved === 'false') {
    result += ` AND resolved = 0`;
  }

  if (filters.search) {
    result += ` AND (error_message LIKE ? OR error_category LIKE ? OR user_name LIKE ?)`;
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  return result;
}

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

    const filters = parseQuery(request.nextUrl.searchParams);

    const params: (string | number)[] = [];
    let query = appendCommonFilters(`
      SELECT 
        id, report_id, ts, user_id, user_name, user_hash,
        error_category, error_severity, error_message, error_details,
        error_status_code, error_request_path, user_description,
        environment_json, app_version, resolved
      FROM error_reports
      WHERE 1=1
    `, params, filters);

    const countParams: (string | number)[] = [];
    const countQuery = appendCommonFilters(
      `SELECT COUNT(*) as total FROM error_reports WHERE 1=1`,
      countParams,
      filters
    );
    
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;

    // Add ordering and pagination
    query += ` ORDER BY ts DESC LIMIT ? OFFSET ?`;
    params.push(filters.limit, filters.offset);

    const reports = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      data: reports,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        hasMore: filters.offset + filters.limit < total,
      },
    });
  } catch (error) {
    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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

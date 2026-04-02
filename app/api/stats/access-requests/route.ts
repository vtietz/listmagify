import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats, getAllSessionUserIds } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';
import { sendApprovalEmail, sendRejectionEmail, sendRevokedEmail } from '@/lib/email/access-request-emails';
import { parseAccessRequestQuery } from '@/lib/repositories/statsRepository';
import { isAppRouteError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// Re-export for backward compatibility if used elsewhere
export { sendRevokedEmail };

type StatsContext = { db: NonNullable<ReturnType<typeof getDb>> };

async function getStatsContext(): Promise<StatsContext | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isUserAllowedForStats(getAllSessionUserIds(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Stats not enabled' }, { status: 503 });
  }

  return { db };
}

function buildAccessRequestFilters(status?: string, search?: string) {
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (status) {
    whereClauses.push('status = ?');
    params.push(status);
  }

  if (search) {
    whereClauses.push('(name LIKE ? OR email LIKE ? OR spotify_username LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  return { whereClauses, params };
}

function buildOrderBy(sortBy: string) {
  if (sortBy === 'activity') {
    return ' ORDER BY activity_count DESC, ar.ts DESC';
  }

  if (sortBy === 'name') {
    return ' ORDER BY ar.name COLLATE NOCASE ASC';
  }

  return ' ORDER BY ar.ts DESC';
}

function mapGetAccessRequestsError(error: unknown): NextResponse {
  if (isAppRouteError(error) && error.status === 400) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error('[stats] Error fetching access requests:', error);
  return NextResponse.json(
    { error: 'Failed to fetch access requests' },
    { status: 500 }
  );
}

async function notifyStatusChange(name: string, email: string, status: string) {
  try {
    if (status === 'approved') {
      await sendApprovalEmail(name, email);
      return;
    }

    if (status === 'rejected') {
      await sendRejectionEmail(name, email);
      return;
    }

    if (status === 'removed') {
      await sendRevokedEmail(name, email);
    }
  } catch (error) {
    console.error('[access-requests] Failed to send status email:', error);
  }
}

function parsePatchUpdates(status: unknown, notes: unknown) {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (typeof status === 'string' && status.length > 0) {
    updates.push('status = ?');
    params.push(status);
  }

  if (notes !== undefined) {
    updates.push('notes = ?');
    const normalizedNotes = typeof notes === 'string' && notes.length > 0 ? notes : null;
    params.push(normalizedNotes);
  }

  return { updates, params };
}

/**
 * GET /api/stats/access-requests
 * 
 * Fetches access requests for the stats dashboard.
 * Protected by STATS_ALLOWED_USER_IDS check.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getStatsContext();
    if (context instanceof NextResponse) {
      return context;
    }
    const { db } = context;

    const { limit, offset, status, sortBy, search } = parseAccessRequestQuery(request.nextUrl.searchParams);
    const filters = buildAccessRequestFilters(status, search);
    const whereClause = filters.whereClauses.length > 0
      ? ` AND ${filters.whereClauses.join(' AND ')}`
      : '';

    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM access_requests
      WHERE 1=1${whereClause}
    `).get(...filters.params) as { total: number };
    const total = countResult.total;

    const allQuery = `
      SELECT ar.*, COALESCE(e.event_count, 0) as activity_count
      FROM access_requests ar
      LEFT JOIN (
        SELECT user_id, COUNT(*) as event_count
        FROM events
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      ) e ON COALESCE(ar.user_id, ar.spotify_username) = e.user_id
      WHERE 1=1${whereClause}
      ${buildOrderBy(sortBy)}
      LIMIT ? OFFSET ?
    `;
    const allParams: (string | number)[] = [...filters.params, limit, offset];
    
    const requests = db.prepare(allQuery).all(...allParams) as any[];

    return NextResponse.json({
      success: true,
      data: requests,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    return mapGetAccessRequestsError(error);
  }
}

/**
 * PATCH /api/stats/access-requests
 * 
 * Updates access request status and notes.
 */
export async function PATCH(request: NextRequest) {
  try {
    const context = await getStatsContext();
    if (context instanceof NextResponse) {
      return context;
    }
    const { db } = context;

    const body = await request.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Get the access request details for email
    const accessRequest = db.prepare(`
      SELECT name, email, spotify_username
      FROM access_requests
      WHERE id = ?
    `).get(id) as { name: string; email: string; spotify_username: string | null } | undefined;

    if (!accessRequest) {
      return NextResponse.json({ error: 'Access request not found' }, { status: 404 });
    }

    const parsedStatus = typeof status === 'string' ? status : undefined;
    if (parsedStatus) {
      await notifyStatusChange(accessRequest.name, accessRequest.email, parsedStatus);
    }

    const { updates, params } = parsePatchUpdates(parsedStatus, notes);

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    params.push(id);

    db.prepare(`
      UPDATE access_requests
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[stats] Error updating access request:', error);
    return NextResponse.json(
      { error: 'Failed to update access request' },
      { status: 500 }
    );
  }
}

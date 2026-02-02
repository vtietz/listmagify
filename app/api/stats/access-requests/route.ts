import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';
import { isUserAllowedForStats } from '@/lib/metrics/env';
import { getDb } from '@/lib/metrics/db';
import { sendApprovalEmail, sendRejectionEmail, sendRevokedEmail } from '@/lib/email/access-request-emails';

export const dynamic = 'force-dynamic';

// Re-export for backward compatibility if used elsewhere
export { sendRevokedEmail };

/**
 * GET /api/stats/access-requests
 * 
 * Fetches access requests for the stats dashboard.
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status'); // null = all, 'pending', 'approved', 'rejected'
    const sortBy = searchParams.get('sortBy') || 'date'; // 'date', 'activity', 'name'
    const search = searchParams.get('search'); // search across name, email, spotify_username

    let query = `
      SELECT id, ts, name, email, spotify_username, motivation, status, notes, red_flags
      FROM access_requests
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    // Access requests are not time-filtered - always show all

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (name LIKE ? OR email LIKE ? OR spotify_username LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Get total count using a simple count query with the same WHERE clause
    let countQuery = `SELECT COUNT(*) as total FROM access_requests WHERE 1=1`;
    const countParams: (string | number)[] = [];
    
    // Access requests are not time-filtered
    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    if (search) {
      countQuery += ` AND (name LIKE ? OR email LIKE ? OR spotify_username LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;

    // For activity sorting, we need to use a different query with LEFT JOIN
    if (sortBy === 'activity') {
      // Get ALL matching records (before pagination) to sort by activity globally
      const allQuery = `
        SELECT ar.*, COALESCE(ue.event_count, 0) as activity_count
        FROM access_requests ar
        LEFT JOIN (
          SELECT user_id, COUNT(*) as event_count
          FROM user_events
          GROUP BY user_id
        ) ue ON ar.spotify_username = ue.user_id
        WHERE 1=1
        ${status ? 'AND ar.status = ?' : ''}
        ${search ? 'AND (ar.name LIKE ? OR ar.email LIKE ? OR ar.spotify_username LIKE ?)' : ''}
        ORDER BY activity_count DESC, ar.ts DESC
      `;
      
      const allParams: (string | number)[] = [];
      if (status) allParams.push(status);
      if (search) {
        const searchPattern = `%${search}%`;
        allParams.push(searchPattern, searchPattern, searchPattern);
      }
      
      const allRequests = db.prepare(allQuery).all(...allParams) as any[];
      
      // Apply pagination in-memory
      const requests = allRequests.slice(offset, offset + limit);
      
      return NextResponse.json({
        success: true,
        data: requests,
        pagination: {
          total: allRequests.length,
          limit,
          offset,
          hasMore: offset + limit < allRequests.length,
        },
      });
    }

    // Add ordering for date and name sorting
    let orderClause = 'ORDER BY ts DESC'; // default: date
    if (sortBy === 'name') {
      orderClause = 'ORDER BY name COLLATE NOCASE ASC';
    }

    query += ` ${orderClause} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const requests = db.prepare(query).all(...params) as any[];

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
    console.error('[stats] Error fetching access requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access requests' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/stats/access-requests
 * 
 * Updates access request status and notes.
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

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      
      // Send email notification based on status
      try {
        if (status === 'approved') {
          await sendApprovalEmail(accessRequest.name, accessRequest.email);
        } else if (status === 'rejected') {
          await sendRejectionEmail(accessRequest.name, accessRequest.email);
        } else if (status === 'removed') {
          await sendRevokedEmail(accessRequest.name, accessRequest.email);
        }
      } catch (error) {
        // Log error but don't fail the status update
        console.error('[access-requests] Failed to send status email:', error);
      }
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes || null);
    }

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

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
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status'); // null = all, 'pending', 'approved', 'rejected'

    let query = `
      SELECT id, ts, name, email, spotify_username, motivation, status, notes, red_flags
      FROM access_requests
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

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    // Get total count using a simple count query with the same WHERE clause
    let countQuery = `SELECT COUNT(*) as total FROM access_requests WHERE 1=1`;
    const countParams: (string | number)[] = [];
    
    if (from) {
      countQuery += ` AND DATE(ts) >= ?`;
      countParams.push(from);
    }
    if (to) {
      countQuery += ` AND DATE(ts) <= ?`;
      countParams.push(to);
    }
    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }
    
    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;

    // Add ordering and pagination
    query += ` ORDER BY ts DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const requests = db.prepare(query).all(...params);

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

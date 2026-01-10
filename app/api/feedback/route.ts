/**
 * Feedback API - Submit user feedback with NPS score.
 * 
 * POST /api/feedback
 * Body: { npsScore: number (0-10), comment?: string }
 * 
 * Stores feedback in metrics database and optionally sends email notification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { saveFeedback, getFeedbackStats } from '@/lib/metrics/feedback';
import { getContactInfo } from '@/lib/contact';
import { sendFeedbackEmail } from '@/lib/email';

/**
 * POST /api/feedback - Submit user feedback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { npsScore, comment } = body;

    // Validate NPS score
    if (typeof npsScore !== 'number' || npsScore < 0 || npsScore > 10) {
      return NextResponse.json(
        { success: false, error: 'NPS score must be a number between 0 and 10' },
        { status: 400 }
      );
    }

    // Validate comment (optional)
    if (comment !== undefined && typeof comment !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Comment must be a string' },
        { status: 400 }
      );
    }

    // Get user ID from token if available (optional - feedback can be anonymous)
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET! });
    const userId = (token as { sub?: string })?.sub ?? null;

    // Save to database
    const feedbackId = saveFeedback({
      userId,
      npsScore,
      comment: comment?.trim() || null,
    });

    // Send email notification (best effort, don't fail on email errors)
    const contactInfo = getContactInfo();
    if (contactInfo.email && !contactInfo.email.includes('[')) {
      try {
        await sendFeedbackEmail({
          to: contactInfo.email,
          npsScore,
          comment: comment?.trim() || null,
          userId,
        });
      } catch (emailError) {
        console.error('[feedback] Failed to send email notification:', emailError);
        // Continue - email failure shouldn't fail the request
      }
    }

    return NextResponse.json({
      success: true,
      feedbackId,
    });
  } catch (error) {
    console.error('[feedback] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback - Get feedback statistics (admin only)
 * Query params: from, to (date range)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Default to last 30 days
  const today = new Date().toISOString().split('T')[0]!;
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  
  const from = searchParams.get('from') || monthAgo;
  const to = searchParams.get('to') || today;

  try {
    const stats = getFeedbackStats({ from, to });
    
    return NextResponse.json({
      success: true,
      data: stats,
      range: { from, to },
    });
  } catch (error) {
    console.error('[feedback] GET Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feedback stats' },
      { status: 500 }
    );
  }
}

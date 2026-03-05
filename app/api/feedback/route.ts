/**
 * Feedback API - Submit user feedback with NPS score.
 * 
 * POST /api/feedback
 * Body: { npsScore?: number (0-10), comment?: string, name?: string, email?: string }
 * 
 * Stores feedback in metrics database and optionally sends email notification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { z } from 'zod';
import { saveFeedback, getFeedbackStats } from '@/lib/metrics/feedback';
import { getContactInfo } from '@/lib/contact';
import { sendFeedbackEmail } from '@/lib/email';

const feedbackSchema = z.object({
  npsScore: z.number().min(0).max(10).nullable().optional(),
  comment: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

function parseFeedbackBody(payload: unknown) {
  const parsed = feedbackSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.[0];
    if (path === 'comment') return { ok: false as const, error: 'Comment must be a string' };
    if (path === 'name') return { ok: false as const, error: 'Name must be a string' };
    if (path === 'email') return { ok: false as const, error: 'Email must be a string' };
    return { ok: false as const, error: 'NPS score must be a number between 0 and 10' };
  }

  const normalizedComment = (parsed.data.comment ?? '').trim();
  const normalizedName = (parsed.data.name ?? '').trim();
  const normalizedEmail = (parsed.data.email ?? '').trim();
  const npsScore = parsed.data.npsScore;

  const hasAnyInput =
    typeof npsScore === 'number' ||
    normalizedComment.length > 0 ||
    normalizedName.length > 0 ||
    normalizedEmail.length > 0;

  if (!hasAnyInput) {
    return { ok: false as const, error: 'Please provide a score, a comment, or contact info' };
  }

  if (normalizedEmail.length > 0) {
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!isEmailValid) {
      return { ok: false as const, error: 'Email address is invalid' };
    }
  }

  return {
    ok: true as const,
    value: {
      npsScore: typeof npsScore === 'number' ? npsScore : null,
      comment: normalizedComment || null,
      name: normalizedName || null,
      email: normalizedEmail || null,
    },
  };
}

/**
 * POST /api/feedback - Submit user feedback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseFeedbackBody(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET! });
    const userId = (token as { sub?: string })?.sub ?? null;

    const feedbackId = saveFeedback({
      userId,
      npsScore: parsed.value.npsScore,
      comment: parsed.value.comment,
      name: parsed.value.name,
      email: parsed.value.email,
    });

    const contactInfo = getContactInfo();
    if (contactInfo.email && !contactInfo.email.includes('[')) {
      try {
        await sendFeedbackEmail({
          to: contactInfo.email,
          npsScore: parsed.value.npsScore,
          comment: parsed.value.comment,
          name: parsed.value.name,
          email: parsed.value.email,
          userId,
        });
      } catch (emailError) {
        console.error('[feedback] Failed to send email notification:', emailError);
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

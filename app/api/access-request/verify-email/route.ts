import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { serverEnv } from '@/lib/env';
import { sendVerificationCodeEmail } from '@/lib/email/verification-emails';
import { getDb } from '@/lib/metrics/db';
import { parseVerifyCodeInput, parseVerifyEmailInput } from '@/lib/services/accessRequestService';
import { isAppRouteError } from '@/lib/errors';

function isVerificationEnabled(): boolean {
  return serverEnv.ACCESS_REQUEST_ENABLED && serverEnv.ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED;
}

function featureDisabledResponse() {
  return NextResponse.json({ error: 'Email verification not enabled' }, { status: 404 });
}

function verifyCodeRecord(record: {
  id: number;
  verification_token: string;
  expires_at: string;
  verified: number;
}) {
  if (record.verified) {
    return {
      done: true as const,
      response: NextResponse.json({
        success: true,
        verificationToken: record.verification_token,
        message: 'Email already verified',
      }),
    };
  }

  if (new Date(record.expires_at) < new Date()) {
    return {
      done: true as const,
      response: NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 }),
    };
  }

  return { done: false as const };
}

export async function POST(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!isVerificationEnabled()) {
      return featureDisabledResponse();
    }

    const { email } = parseVerifyEmailInput(await request.json());
    const code = crypto.randomInt(100000, 999999).toString();
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const db = getDb();
    if (db) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare('DELETE FROM email_verification_codes WHERE email = ? AND verified = 0').run(email);
      db.prepare(`
        INSERT INTO email_verification_codes (email, code, expires_at, verification_token)
        VALUES (?, ?, ?, ?)
      `).run(email, code, expiresAt, verificationToken);
    } else {
      console.warn('[verify-email] Database not available, verification code not stored');
    }

    try {
      await sendVerificationCodeEmail(email, code);
    } catch (error) {
      console.error('[verify-email] Failed to send email:', error);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please check SMTP configuration.' },
        { status: 503 }
      );
    }

    console.debug(`[verify-email] Verification code sent to ${email}`);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent. Please check your email (including spam folder).',
      verificationToken: db ? verificationToken : undefined,
    });
  } catch (error) {
    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes('required')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[verify-email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send verification code. Please try again later.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!isVerificationEnabled()) {
      return featureDisabledResponse();
    }

    const { email, code } = parseVerifyCodeInput(await request.json());
    const db = getDb();
    if (!db) {
      console.error('[verify-email] Database not available for verification');
      return NextResponse.json(
        { error: 'Verification system not available. Please contact the administrator.' },
        { status: 503 }
      );
    }

    const record = db.prepare(`
      SELECT id, verification_token, expires_at, verified
      FROM email_verification_codes
      WHERE email = ? AND code = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(email, code) as {
      id: number;
      verification_token: string;
      expires_at: string;
      verified: number;
    } | undefined;

    if (!record) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    const verificationCheck = verifyCodeRecord(record);
    if (verificationCheck.done) {
      return verificationCheck.response;
    }

    db.prepare('UPDATE email_verification_codes SET verified = 1 WHERE id = ?').run(record.id);
    console.debug(`[verify-email] Email verified: ${email}`);

    return NextResponse.json({
      success: true,
      verificationToken: record.verification_token,
      message: 'Email verified successfully',
    });
  } catch (error) {
    if (isAppRouteError(error) && error.status === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && (error.message.includes('required') || error.message.includes('Invalid'))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[verify-email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify code. Please try again.' },
      { status: 500 }
    );
  }
}
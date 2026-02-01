import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { getDb } from '@/lib/metrics/db';
import { sendVerificationCodeEmail } from '@/lib/email/verification-emails';
import crypto from 'crypto';

/**
 * POST /api/access-request/verify-email
 * 
 * Sends a verification code to the user's email.
 * Used before submitting access request to verify email ownership.
 */
export async function POST(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!serverEnv.ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED) {
      return NextResponse.json({ error: 'Email verification not enabled' }, { status: 404 });
    }

    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const emailTrimmed = email.trim().toLowerCase();

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();
    
    // Generate verification token (used to tie code verification to request submission)
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Store code in database (expires in 15 minutes)
    const db = getDb();
    if (db) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      
      // Delete any old unverified codes for this email
      db.prepare('DELETE FROM email_verification_codes WHERE email = ? AND verified = 0').run(emailTrimmed);
      
      // Insert new code
      db.prepare(`
        INSERT INTO email_verification_codes (email, code, expires_at, verification_token)
        VALUES (?, ?, ?, ?)
      `).run(emailTrimmed, code, expiresAt, verificationToken);
    } else {
      // If no DB, still allow email sending (less secure but functional)
      console.warn('[verify-email] Database not available, verification code not stored');
    }

    // Send verification email
    try {
      await sendVerificationCodeEmail(emailTrimmed, code);
    } catch (error) {
      console.error('[verify-email] Failed to send email:', error);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please check SMTP configuration.' },
        { status: 503 }
      );
    }

    console.debug(`[verify-email] Verification code sent to ${emailTrimmed}`);
    
    return NextResponse.json({ 
      success: true,
      message: 'Verification code sent. Please check your email (including spam folder).',
      verificationToken: db ? verificationToken : undefined,
    });
  } catch (error) {
    console.error('[verify-email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send verification code. Please try again later.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/access-request/verify-email
 * 
 * Verifies the code entered by the user.
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!serverEnv.ACCESS_REQUEST_ENABLED) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!serverEnv.ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED) {
      return NextResponse.json({ error: 'Email verification not enabled' }, { status: 404 });
    }

    const body = await request.json();
    const { email, code } = body;

    // Validate input
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Valid 6-digit code is required' }, { status: 400 });
    }

    const emailTrimmed = email.trim().toLowerCase();
    const codeTrimmed = code.trim();

    const db = getDb();
    if (!db) {
      console.error('[verify-email] Database not available for verification');
      return NextResponse.json(
        { error: 'Verification system not available. Please contact the administrator.' },
        { status: 503 }
      );
    }

    // Find matching code
    const record = db.prepare(`
      SELECT id, verification_token, expires_at, verified
      FROM email_verification_codes
      WHERE email = ? AND code = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(emailTrimmed, codeTrimmed) as {
      id: number;
      verification_token: string;
      expires_at: string;
      verified: number;
    } | undefined;

    if (!record) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Check if already verified
    if (record.verified) {
      return NextResponse.json({ 
        success: true, 
        verificationToken: record.verification_token,
        message: 'Email already verified',
      });
    }

    // Check if expired
    const expiresAt = new Date(record.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    // Mark as verified
    db.prepare('UPDATE email_verification_codes SET verified = 1 WHERE id = ?').run(record.id);

    console.debug(`[verify-email] Email verified: ${emailTrimmed}`);

    return NextResponse.json({ 
      success: true,
      verificationToken: record.verification_token,
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('[verify-email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify code. Please try again.' },
      { status: 500 }
    );
  }
}

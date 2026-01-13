import { NextResponse } from 'next/server';
import { logAuthEvent } from '@/lib/metrics/logger';

/**
 * Log a failed login attempt from OAuth redirect.
 * This is called when Spotify returns an error (e.g., access_denied).
 * 
 * POST /api/auth/log-failure
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const errorCode = body.error;

    if (errorCode && typeof errorCode === 'string') {
      // Log the failed attempt
      logAuthEvent('login_failure', undefined, errorCode);
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: 'No error code provided' }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 });
  }
}

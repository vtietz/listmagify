import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth/auth';
import type { MusicProviderId } from '@/lib/music-provider/types';

export const dynamic = 'force-dynamic';

const BACKUP_COOKIE_NAME = '__listmagify_provider_backup';
const BACKUP_MAX_AGE_SECONDS = 300;

interface SessionProviderToken {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  isByok?: boolean;
  byok?: { clientId?: string; clientSecret?: string };
  error?: string;
}

interface SessionWithTokens {
  musicProviderTokens?: Partial<Record<MusicProviderId, SessionProviderToken>>;
}

/**
 * Saves the current provider tokens into a short-lived cookie before
 * an OAuth redirect so the JWT callback can restore them after sign-in.
 *
 * NextAuth v4 creates a fresh default token on sign-in (name/email/sub only),
 * which loses any custom fields like musicProviderTokens from the previous JWT.
 * This backup cookie allows the JWT callback to recover them.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as SessionWithTokens | null;
    const providerTokens = typedSession?.musicProviderTokens ?? {};

    const backup: Partial<Record<MusicProviderId, SessionProviderToken>> = {};

    for (const [providerId, token] of Object.entries(providerTokens)) {
      if (token?.accessToken) {
        backup[providerId as MusicProviderId] = token;
      }
    }

    if (Object.keys(backup).length === 0) {
      return NextResponse.json({ preserved: false });
    }

    const cookieStore = await cookies();
    cookieStore.set(BACKUP_COOKIE_NAME, JSON.stringify(backup), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: BACKUP_MAX_AGE_SECONDS,
      secure: process.env.NEXTAUTH_URL?.startsWith('https') ?? false,
    });

    return NextResponse.json({ preserved: true });
  } catch (error) {
    console.error('[auth/preserve-tokens] Failed to preserve tokens', error);
    return NextResponse.json({ preserved: false });
  }
}

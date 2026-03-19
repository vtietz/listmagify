import { requireAuth, type AuthenticatedSession } from '@/lib/auth/requireAuth';
import type { MusicProviderId } from '@/lib/music-provider/types';

const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const refreshInFlight = new Map<string, Promise<AuthenticatedSession>>();

function getSessionKey(session: AuthenticatedSession, providerId?: MusicProviderId): string {
  const identity = session.user?.email ?? session.user?.name ?? 'default-session';
  const effectiveProvider = providerId ?? session.providerId ?? 'spotify';
  return `${effectiveProvider}:${identity}`;
}

export function tokenNeedsRefresh(
  accessTokenExpires?: number,
  nowMs = Date.now(),
  refreshBufferMs = DEFAULT_REFRESH_BUFFER_MS
): boolean {
  if (!accessTokenExpires) {
    return false;
  }

  return nowMs >= accessTokenExpires - refreshBufferMs;
}

async function refreshSessionSingleFlight(key: string, providerId?: MusicProviderId): Promise<AuthenticatedSession> {
  const inFlight = refreshInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise = requireAuth(providerId).finally(() => {
    refreshInFlight.delete(key);
  });

  refreshInFlight.set(key, refreshPromise);
  return refreshPromise;
}

export async function getManagedSession(providerId?: MusicProviderId): Promise<AuthenticatedSession> {
  const session = await requireAuth(providerId);

  if (!tokenNeedsRefresh(session.accessTokenExpires)) {
    return session;
  }

  return refreshSessionSingleFlight(getSessionKey(session, providerId), providerId);
}

import { requireAuth, type AuthenticatedSession } from '@/lib/auth/requireAuth';

const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const refreshInFlight = new Map<string, Promise<AuthenticatedSession>>();

function getSessionKey(session: AuthenticatedSession): string {
  return session.user?.email ?? session.user?.name ?? 'default-session';
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

async function refreshSessionSingleFlight(key: string): Promise<AuthenticatedSession> {
  const inFlight = refreshInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const refreshPromise = requireAuth().finally(() => {
    refreshInFlight.delete(key);
  });

  refreshInFlight.set(key, refreshPromise);
  return refreshPromise;
}

export async function getManagedSession(): Promise<AuthenticatedSession> {
  const session = await requireAuth();

  if (!tokenNeedsRefresh(session.accessTokenExpires)) {
    return session;
  }

  return refreshSessionSingleFlight(getSessionKey(session));
}

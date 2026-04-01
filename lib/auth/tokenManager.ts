import { requireAuth, type AuthenticatedSession } from '@/lib/auth/requireAuth';
import type { MusicProviderId } from '@/lib/music-provider/types';

/**
 * Returns an authenticated session for the given provider.
 *
 * Token refresh is handled by the NextAuth JWT callback (auth.ts) which is
 * triggered automatically when `getServerSession()` is called inside
 * `requireAuth()`. A circuit breaker in tokenRefresh.ts prevents retry
 * storms on permanent failures.
 *
 * Previously this function maintained its own expiry check and single-flight
 * dedup, duplicating what the JWT callback already does. That redundancy
 * caused double-refresh cycles on every API call.
 */
export async function getManagedSession(providerId?: MusicProviderId): Promise<AuthenticatedSession> {
  return requireAuth(providerId);
}

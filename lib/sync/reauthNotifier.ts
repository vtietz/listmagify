/**
 * Emails a user once when background sync can no longer authenticate
 * with one of their providers.
 *
 * Triggered by scheduled runs that find no valid session. The DB claim in
 * claimReauthNotification guarantees a single email per provider account
 * until the user signs in again (which clears the claim).
 */

import type { MusicProviderId } from '@/lib/music-provider/types';
import { getProviderDisplayName } from '@/lib/music-provider/providerLabels';
import { claimReauthNotification, releaseReauthNotification } from '@/lib/auth/tokenNotificationStore';
import { sendReauthRequiredEmail } from '@/lib/email/reauth-emails';
import { serverEnv } from '@/lib/env';

export async function notifyReauthRequired(userId: string, providerId: MusicProviderId): Promise<void> {
  let email: string | null;
  try {
    email = claimReauthNotification(userId, providerId);
  } catch (error) {
    console.error('[sync/reauth] Failed to claim re-auth notification', { userId, providerId, error });
    return;
  }

  if (!email) return;

  try {
    const sent = await sendReauthRequiredEmail({
      email,
      providerName: getProviderDisplayName(providerId),
      appUrl: serverEnv.NEXTAUTH_URL,
    });
    if (!sent) {
      releaseReauthNotification(userId, providerId);
    }
  } catch (error) {
    console.error('[sync/reauth] Failed to send re-auth email', { userId, providerId, error });
    releaseReauthNotification(userId, providerId);
  }
}

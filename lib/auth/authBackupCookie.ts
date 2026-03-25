import { cookies } from 'next/headers';
import type { MusicProviderId } from '@/lib/music-provider/types';

type ProviderJwtToken = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  isByok?: boolean;
  byok?: {
    clientId?: string;
    clientSecret?: string;
  };
  error?: string;
};

export const BACKUP_COOKIE_NAME = '__listmagify_provider_backup';

export async function restoreProviderTokensFromBackup(
  providerTokens: Partial<Record<MusicProviderId, ProviderJwtToken>>,
  accountProviderId: MusicProviderId | null,
  toMusicProviderId: (value: unknown) => MusicProviderId | null,
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(BACKUP_COOKIE_NAME)?.value;
    if (!raw) {
      return;
    }

    const backup = JSON.parse(raw) as Partial<Record<string, ProviderJwtToken>>;

    for (const [key, token] of Object.entries(backup)) {
      const pid = toMusicProviderId(key);
      if (!pid || !token?.accessToken) {
        continue;
      }

      if (pid === accountProviderId) {
        continue;
      }

      if (!providerTokens[pid]?.accessToken) {
        providerTokens[pid] = token;
      }
    }

    cookieStore.delete(BACKUP_COOKIE_NAME);
  } catch {
    // Cookie parsing or deletion failed - not critical
  }
}

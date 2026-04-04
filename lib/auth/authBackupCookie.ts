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

type BackupPayload = {
  tokens: Partial<Record<string, ProviderJwtToken>>;
  providerAccountIds?: Partial<Record<string, string>>;
};

/**
 * Parse backup cookie value. Handles both:
 * - Legacy format: `{ spotify: { accessToken: ... } }` (flat token map)
 * - New format: `{ tokens: { ... }, providerAccountIds: { ... } }`
 */
function parseBackup(raw: string): BackupPayload {
  const parsed = JSON.parse(raw);

  // New format has a `tokens` key
  if (parsed.tokens && typeof parsed.tokens === 'object') {
    return parsed as BackupPayload;
  }

  // Legacy format: the entire object is the token map
  return { tokens: parsed as Partial<Record<string, ProviderJwtToken>> };
}

export async function restoreProviderTokensFromBackup(
  providerTokens: Partial<Record<MusicProviderId, ProviderJwtToken>>,
  accountProviderId: MusicProviderId | null,
  toMusicProviderId: (value: unknown) => MusicProviderId | null,
  jwtToken?: Record<string, any>,
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(BACKUP_COOKIE_NAME)?.value;
    if (!raw) {
      return;
    }

    const backup = parseBackup(raw);

    // Restore provider tokens
    for (const [key, token] of Object.entries(backup.tokens)) {
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

    // Restore providerAccountIds into the JWT token so admin checks
    // and data scoping can see all connected provider IDs
    if (jwtToken && backup.providerAccountIds) {
      const existing = (jwtToken.providerAccountIds ?? {}) as Partial<Record<string, string>>;
      jwtToken.providerAccountIds = { ...backup.providerAccountIds, ...existing };
    }

    cookieStore.delete(BACKUP_COOKIE_NAME);
  } catch {
    // Cookie parsing or deletion failed - not critical
  }
}

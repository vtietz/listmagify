/**
 * Metrics-specific environment configuration.
 * Isolated from main env.ts to avoid circular dependencies.
 */

export interface MetricsConfig {
  enabled: boolean;
  dbPath: string;
  salt: string;
  allowedUserIds: string[];
  showUserDetails: boolean; // Whether to show user detail popup (fetches username/email from Spotify API on-click)
  providerDimensionEnabled: boolean;
}

/**
 * Parse metrics environment variables.
 * All STATS_* variables are optional - metrics disabled by default.
 */
export function getMetricsConfig(): MetricsConfig {
  const enabled = process.env.STATS_ENABLED === 'true';
  const isDev = process.env.NODE_ENV === 'development';
  const defaultDbPath = isDev ? '/tmp/listmagify-metrics.db' : './data/metrics.db';
  const dbPath = process.env.STATS_DB_PATH || defaultDbPath;
  const salt = process.env.STATS_SALT || 'default-salt-change-me';
  const allowedUserIds = (process.env.STATS_ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  const showUserDetails = process.env.STATS_SHOW_USER_DETAILS === 'true';
  const providerDimensionEnabled = process.env.STATS_PROVIDER_DIMENSION === 'true';

  return {
    enabled,
    dbPath,
    salt,
    allowedUserIds,
    showUserDetails,
    providerDimensionEnabled,
  };
}

/**
 * Collect all user IDs from a session — includes `session.user.id` (token.sub)
 * plus any per-provider account IDs stored in `session.providerAccountIds`.
 *
 * This is useful because `token.sub` is set by whichever provider the user
 * signed in with *first*, and may not match the ID the admin put in the
 * allowlist. Checking all connected provider IDs avoids that ambiguity.
 */
export function getAllSessionUserIds(
  session: { user?: { id?: string }; providerAccountIds?: Record<string, string> },
): string[] {
  const ids: string[] = [];
  if (session?.user?.id) ids.push(session.user.id);
  if (session?.providerAccountIds) {
    for (const id of Object.values(session.providerAccountIds)) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Check if a provider user ID (or array of IDs) is in the stats allowlist.
 */
export function isUserAllowedForStats(userId: string | string[] | undefined | null): boolean {
  if (!userId) return false;
  const config = getMetricsConfig();
  const ids = Array.isArray(userId) ? userId : [userId];
  return ids.some(id => config.allowedUserIds.includes(id));
}

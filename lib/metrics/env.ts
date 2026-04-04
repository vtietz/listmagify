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
 * @deprecated Use getAllSessionUserIds from '@/lib/auth/sessionUserIds' instead.
 * Re-exported here for backward compat with existing stats imports.
 */
export { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';

/**
 * Check if a provider user ID (or array of IDs) is in the stats allowlist.
 */
export function isUserAllowedForStats(userId: string | string[] | undefined | null): boolean {
  if (!userId) return false;
  const config = getMetricsConfig();
  const ids = Array.isArray(userId) ? userId : [userId];
  return ids.some(id => config.allowedUserIds.includes(id));
}

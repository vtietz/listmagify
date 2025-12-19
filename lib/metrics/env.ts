/**
 * Metrics-specific environment configuration.
 * Isolated from main env.ts to avoid circular dependencies.
 */

export interface MetricsConfig {
  enabled: boolean;
  dbPath: string;
  salt: string;
  allowedUserIds: string[];
}

/**
 * Parse metrics environment variables.
 * All STATS_* variables are optional - metrics disabled by default.
 */
export function getMetricsConfig(): MetricsConfig {
  const enabled = process.env.STATS_ENABLED === 'true';
  const dbPath = process.env.STATS_DB_PATH || './data/metrics.db';
  const salt = process.env.STATS_SALT || 'default-salt-change-me';
  const allowedUserIds = (process.env.STATS_ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  return {
    enabled,
    dbPath,
    salt,
    allowedUserIds,
  };
}

/**
 * Check if a Spotify user ID is in the stats allowlist.
 */
export function isUserAllowedForStats(spotifyUserId: string | undefined | null): boolean {
  if (!spotifyUserId) return false;
  const config = getMetricsConfig();
  return config.allowedUserIds.includes(spotifyUserId);
}

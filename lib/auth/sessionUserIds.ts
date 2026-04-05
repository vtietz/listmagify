/**
 * Provider-prefixed user identity utilities.
 *
 * In a multi-provider setup, raw user IDs are ambiguous — Spotify user "12345"
 * and TIDAL user "12345" could be different people. Prefixed IDs like
 * "spotify:simsonoo" or "tidal:181936426" remove this ambiguity.
 *
 * Format: "provider:accountId" (e.g., "spotify:simsonoo", "tidal:181936426")
 */

/**
 * Build a prefixed user ID: "provider:accountId"
 */
export function prefixedUserId(provider: string, accountId: string): string {
  return `${provider}:${accountId}`;
}

/**
 * Get the preferred user ID for creating new records.
 * Uses the prefixed format: "provider:accountId" from the first available provider.
 */
export function getCreatorUserId(
  session: { user?: { id?: string }; providerAccountIds?: Record<string, string> } | null,
): string {
  if (!session) return '';

  if (session.providerAccountIds) {
    for (const [provider, accountId] of Object.entries(session.providerAccountIds)) {
      if (accountId) {
        return prefixedUserId(provider, accountId);
      }
    }
  }

  return session.user?.id ?? '';
}

/**
 * Build a map of provider → prefixed userId for all connected providers.
 * Used when creating sync pairs so the executor knows which userId to use per provider.
 */
export function getProviderUserIds(
  session: { providerAccountIds?: Record<string, string> } | null,
): Record<string, string> {
  if (!session?.providerAccountIds) return {};

  const map: Record<string, string> = {};
  for (const [provider, accountId] of Object.entries(session.providerAccountIds)) {
    if (accountId) {
      map[provider] = prefixedUserId(provider, accountId);
    }
  }
  return map;
}

/**
 * Extract ALL known user IDs from a session as prefixed IDs.
 *
 * Returns: ["spotify:simsonoo", "tidal:181936426"]
 *
 * Used for DB queries (WHERE created_by IN (...)) and admin allowlist checks.
 */
export function getAllSessionUserIds(
  session: { user?: { id?: string }; providerAccountIds?: Record<string, string> } | null,
): string[] {
  if (!session) return [];

  const ids: string[] = [];

  if (session.providerAccountIds) {
    for (const [provider, accountId] of Object.entries(session.providerAccountIds)) {
      if (accountId) {
        ids.push(prefixedUserId(provider, accountId));
      }
    }
  }

  return ids;
}

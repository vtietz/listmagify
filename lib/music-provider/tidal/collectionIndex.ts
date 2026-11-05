import type { AuthenticatedSession } from '@/lib/auth/requireAuth';

/**
 * Per-user cache of the TIDAL collection ("liked tracks") track IDs.
 *
 * TIDAL has no "contains" endpoint, so answering containsTracks requires paging
 * through the whole collection. Doing that per request (and per 50-ID batch) makes
 * large collections time out. This index scans once per user, shares the in-flight
 * scan between concurrent callers, and is kept current by save/remove mutations.
 */

export const COLLECTION_INDEX_TTL_MS = 5 * 60 * 1000;

type IndexEntry = {
  ids: Set<string> | null;
  loadedAt: number;
  pending: Promise<Set<string>> | null;
};

type CollectionIndexDependencies = {
  getSession: () => Promise<AuthenticatedSession>;
  fetchAllTrackIds: () => Promise<Set<string>>;
  ttlMs?: number;
  now?: () => number;
};

function getScopeKey(session: AuthenticatedSession): string {
  return session.user?.id ?? session.accessToken;
}

export function createUserCollectionIndex(deps: CollectionIndexDependencies) {
  const ttlMs = deps.ttlMs ?? COLLECTION_INDEX_TTL_MS;
  const now = deps.now ?? Date.now;
  const entries = new Map<string, IndexEntry>();

  function pruneExpired(): void {
    const current = now();
    for (const [key, entry] of entries) {
      if (!entry.pending && current - entry.loadedAt > ttlMs) {
        entries.delete(key);
      }
    }
  }

  async function getKey(): Promise<string> {
    return getScopeKey(await deps.getSession());
  }

  async function getTrackIds(): Promise<Set<string>> {
    const key = await getKey();
    // Read and register the entry synchronously so concurrent callers share one scan.
    pruneExpired();
    const entry = entries.get(key);

    if (entry?.ids && now() - entry.loadedAt <= ttlMs) {
      return entry.ids;
    }

    if (entry?.pending) {
      return entry.pending;
    }

    const pending = deps.fetchAllTrackIds();
    entries.set(key, { ids: null, loadedAt: 0, pending });

    try {
      const ids = await pending;
      entries.set(key, { ids, loadedAt: now(), pending: null });
      return ids;
    } catch (error) {
      entries.delete(key);
      throw error;
    }
  }

  async function applyMutation(trackIds: string[], mutate: (ids: Set<string>, id: string) => void): Promise<void> {
    const entry = entries.get(await getKey());
    const apply = (ids: Set<string>) => trackIds.forEach((id) => mutate(ids, id));

    if (entry?.ids) {
      apply(entry.ids);
      return;
    }

    // A scan in flight may have read the collection before this mutation; apply it on top
    // once it lands, without making the mutation wait for the scan.
    entry?.pending?.then(apply, () => {});
  }

  async function invalidate(): Promise<void> {
    entries.delete(await getKey());
  }

  return {
    getTrackIds,
    markSaved: (trackIds: string[]) => applyMutation(trackIds, (ids, id) => ids.add(id)),
    markRemoved: (trackIds: string[]) => applyMutation(trackIds, (ids, id) => ids.delete(id)),
    invalidate,
  };
}

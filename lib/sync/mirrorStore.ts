import { getRecsDb } from '@/lib/recs/db';
import type { MirrorEntry, MirrorSide } from '@/lib/sync/mirror';

interface MirrorEntryRow {
  side: MirrorSide;
  entryKey: string;
  providerTrackId: string;
  syncKey: string;
  position: number | null;
  addedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt: string | null;
}

/** The pair's local copy of both playlists as of the last sync (empty before the first sync). */
export function loadPairMirror(syncPairId: string): MirrorEntry[] {
  return getRecsDb().prepare(`
    SELECT
      side,
      entry_key AS entryKey,
      provider_track_id AS providerTrackId,
      sync_key AS syncKey,
      position,
      added_at AS addedAt,
      first_seen_at AS firstSeenAt,
      last_seen_at AS lastSeenAt,
      removed_at AS removedAt
    FROM sync_pair_entries
    WHERE sync_pair_id = ?
  `).all(syncPairId) as MirrorEntryRow[];
}

/** Replaces the pair's local copy in one transaction. */
export function savePairMirror(syncPairId: string, entries: readonly MirrorEntry[]): void {
  const db = getRecsDb();
  const remove = db.prepare('DELETE FROM sync_pair_entries WHERE sync_pair_id = ?');
  const insert = db.prepare(`
    INSERT INTO sync_pair_entries (
      sync_pair_id, side, entry_key, provider_track_id, sync_key,
      position, added_at, first_seen_at, last_seen_at, removed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    remove.run(syncPairId);
    for (const entry of entries) {
      insert.run(
        syncPairId,
        entry.side,
        entry.entryKey,
        entry.providerTrackId,
        entry.syncKey,
        entry.position,
        entry.addedAt,
        entry.firstSeenAt,
        entry.lastSeenAt,
        entry.removedAt,
      );
    }
  })();
}

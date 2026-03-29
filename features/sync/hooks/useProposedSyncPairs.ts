'use client';

import { useMemo } from 'react';
import { useSplitGridStore } from '@features/split-editor/stores/useSplitGridStore';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncPairWithRun } from './useSyncPairs';

export interface ProposedSyncPair {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
}

/**
 * Derives sync pair proposals from currently open panels.
 *
 * Generates pairwise combinations (C(n,2)) of unique provider+playlist entries
 * from open panels, excluding any pairs that already exist as saved SyncPairs
 * (checked in both directions).
 *
 * @param savedPairs - Already-saved sync pairs (passed in to avoid duplicate queries).
 */
export function useProposedSyncPairs(
  savedPairs: SyncPairWithRun[] | undefined,
): ProposedSyncPair[] {
  const panels = useSplitGridStore((s) => s.panels);

  return useMemo(() => {
    // 1. Filter to panels with a playlist loaded
    const panelsWithPlaylist = panels.filter(
      (p): p is typeof p & { playlistId: string } => p.playlistId !== null,
    );

    // 2. Deduplicate by provider:playlistId
    const seen = new Set<string>();
    const unique: Array<{ providerId: MusicProviderId; playlistId: string }> = [];
    for (const panel of panelsWithPlaylist) {
      const key = `${panel.providerId}:${panel.playlistId}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ providerId: panel.providerId, playlistId: panel.playlistId });
      }
    }

    // 3. Generate pairwise combinations C(n,2)
    const proposals: ProposedSyncPair[] = [];
    for (let i = 0; i < unique.length; i++) {
      const a = unique[i];
      if (!a) continue;
      for (let j = i + 1; j < unique.length; j++) {
        const b = unique[j];
        if (!b) continue;

        // Guard: skip if both sides are identical (should not happen after dedup)
        if (a.providerId === b.providerId && a.playlistId === b.playlistId) {
          continue;
        }

        proposals.push({
          sourceProvider: a.providerId,
          sourcePlaylistId: a.playlistId,
          targetProvider: b.providerId,
          targetPlaylistId: b.playlistId,
        });
      }
    }

    // 4. Exclude pairs that already exist as saved SyncPairs (either direction)
    if (!savedPairs || savedPairs.length === 0) {
      return proposals;
    }

    const savedKeys = new Set<string>();
    for (const pair of savedPairs) {
      savedKeys.add(
        `${pair.sourceProvider}:${pair.sourcePlaylistId}|${pair.targetProvider}:${pair.targetPlaylistId}`,
      );
      savedKeys.add(
        `${pair.targetProvider}:${pair.targetPlaylistId}|${pair.sourceProvider}:${pair.sourcePlaylistId}`,
      );
    }

    return proposals.filter((p) => {
      const forward = `${p.sourceProvider}:${p.sourcePlaylistId}|${p.targetProvider}:${p.targetPlaylistId}`;
      const reverse = `${p.targetProvider}:${p.targetPlaylistId}|${p.sourceProvider}:${p.sourcePlaylistId}`;
      return !savedKeys.has(forward) && !savedKeys.has(reverse);
    });
  }, [panels, savedPairs]);
}

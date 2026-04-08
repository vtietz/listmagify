import { describe, expect, it, vi } from 'vitest';
import { applySyncPlan } from '@/lib/sync/apply';
import type { MusicProvider } from '@/lib/music-provider/types';
import type { SyncPlan } from '@/lib/sync/types';

describe('applySyncPlan for liked playlists', () => {
  it('uses saveTracks/removeTracks for liked target playlist', async () => {
    const saveTracks = vi.fn().mockResolvedValue(undefined);
    const removeTracks = vi.fn().mockResolvedValue(undefined);
    const containsTracks = vi
      .fn()
      .mockResolvedValueOnce([false])
      .mockResolvedValueOnce([true]);

    const provider = {
      saveTracks,
      removeTracks,
      containsTracks,
    } as unknown as MusicProvider;

    const plan: SyncPlan = {
      sourceProvider: 'spotify',
      sourcePlaylistId: 'playlist-source',
      targetProvider: 'tidal',
      targetPlaylistId: 'liked',
      direction: 'a-to-b',
      items: [
        {
          canonicalTrackId: 'canon-add',
          action: 'add',
          targetProvider: 'tidal',
          title: 'Track Add',
          artists: ['Artist'],
          durationMs: 123000,
          confidence: 1,
          resolvedTargetTrackId: '111',
          materializeStatus: 'resolved',
        },
        {
          canonicalTrackId: 'canon-remove',
          action: 'remove',
          targetProvider: 'tidal',
          title: 'Track Remove',
          artists: ['Artist'],
          durationMs: 124000,
          confidence: 1,
          providerTrackId: '222',
        },
      ],
      summary: {
        toAdd: 1,
        toRemove: 1,
        unresolved: 0,
      },
    };

    const result = await applySyncPlan(plan, { tidal: provider });

    expect(containsTracks).toHaveBeenCalledWith({ ids: ['111'] });
    expect(saveTracks).toHaveBeenCalledWith({ ids: ['111'] });
    expect(removeTracks).toHaveBeenCalledWith({ ids: ['222'] });
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.errors).toEqual([]);
  });
});

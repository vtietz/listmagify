import { describe, expect, it, vi } from 'vitest';
import { createUserCollectionIndex } from '@/lib/music-provider/tidal/collectionIndex';
import type { AuthenticatedSession } from '@/lib/auth/requireAuth';

function session(userId: string): AuthenticatedSession {
  return { accessToken: `token-${userId}`, user: { id: userId } } as AuthenticatedSession;
}

describe('TIDAL user collection index', () => {
  it('shares one in-flight scan between concurrent callers', async () => {
    let resolveScan: (ids: Set<string>) => void = () => {};
    const fetchAllTrackIds = vi.fn(() => new Promise<Set<string>>((resolve) => { resolveScan = resolve; }));
    const index = createUserCollectionIndex({
      getSession: vi.fn().mockResolvedValue(session('u1')),
      fetchAllTrackIds,
    });

    const first = index.getTrackIds();
    const second = index.getTrackIds();
    await vi.waitFor(() => expect(fetchAllTrackIds).toHaveBeenCalledTimes(1));
    resolveScan(new Set(['a']));

    expect(await first).toEqual(new Set(['a']));
    expect(await second).toEqual(new Set(['a']));
    expect(fetchAllTrackIds).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached index until the TTL expires', async () => {
    let currentTime = 0;
    const fetchAllTrackIds = vi.fn().mockResolvedValue(new Set(['a']));
    const index = createUserCollectionIndex({
      getSession: vi.fn().mockResolvedValue(session('u1')),
      fetchAllTrackIds,
      ttlMs: 1000,
      now: () => currentTime,
    });

    await index.getTrackIds();
    currentTime = 500;
    await index.getTrackIds();
    expect(fetchAllTrackIds).toHaveBeenCalledTimes(1);

    currentTime = 2000;
    await index.getTrackIds();
    expect(fetchAllTrackIds).toHaveBeenCalledTimes(2);
  });

  it('keeps separate indexes per user', async () => {
    const getSession = vi.fn()
      .mockResolvedValueOnce(session('u1'))
      .mockResolvedValueOnce(session('u2'));
    const fetchAllTrackIds = vi.fn()
      .mockResolvedValueOnce(new Set(['a']))
      .mockResolvedValueOnce(new Set(['b']));
    const index = createUserCollectionIndex({ getSession, fetchAllTrackIds });

    expect(await index.getTrackIds()).toEqual(new Set(['a']));
    expect(await index.getTrackIds()).toEqual(new Set(['b']));
  });

  it('applies saves and removals to the cached index without rescanning', async () => {
    const fetchAllTrackIds = vi.fn().mockResolvedValue(new Set(['a', 'b']));
    const index = createUserCollectionIndex({
      getSession: vi.fn().mockResolvedValue(session('u1')),
      fetchAllTrackIds,
    });

    await index.getTrackIds();
    await index.markSaved(['c']);
    await index.markRemoved(['a']);

    expect(await index.getTrackIds()).toEqual(new Set(['b', 'c']));
    expect(fetchAllTrackIds).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed scan', async () => {
    const fetchAllTrackIds = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(new Set(['a']));
    const index = createUserCollectionIndex({
      getSession: vi.fn().mockResolvedValue(session('u1')),
      fetchAllTrackIds,
    });

    await expect(index.getTrackIds()).rejects.toThrow('boom');
    expect(await index.getTrackIds()).toEqual(new Set(['a']));
  });
});

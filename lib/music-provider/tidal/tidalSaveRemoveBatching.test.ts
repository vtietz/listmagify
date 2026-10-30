import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTidalProvider } from '@/lib/music-provider/tidal/provider';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Tests that saveTracks and removeTracks correctly sub-batch requests
 * at PLAYLIST_RELATIONSHIP_MAX_BATCH_SIZE (20) to avoid TIDAL's v2 API
 * silently dropping items that exceed the per-request limit.
 */
describe('TIDAL saveTracks/removeTracks batching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeTrackIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String(i + 1));
  }

  function createMockProvider(fetchImpl: typeof fetch) {
    return createTidalProvider({
      fetchImpl,
      getSession: vi.fn().mockResolvedValue({ accessToken: 'token' }),
    });
  }

  describe('saveTracks', () => {
    it('sends 3 API calls for 50 track IDs (20 + 20 + 10)', async () => {
      const trackIds = makeTrackIds(50);

      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: [] }));
      const provider = createMockProvider(fetchImpl);

      await provider.saveTracks({ ids: trackIds });

      const collectionCalls = fetchImpl.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
      );
      expect(collectionCalls).toHaveLength(3);

      const batchSizes = collectionCalls.map(([, init]) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        return body.data.length;
      });
      expect(batchSizes).toEqual([20, 20, 10]);

      // Verify the IDs are correct and in order
      const allSentIds = collectionCalls.flatMap(([, init]) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string; type: string }> };
        return body.data.map((item) => item.id);
      });
      expect(allSentIds).toEqual(trackIds);
    });

    it('sends a single API call for 20 track IDs', async () => {
      const trackIds = makeTrackIds(20);

      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: [] }));
      const provider = createMockProvider(fetchImpl);

      await provider.saveTracks({ ids: trackIds });

      const collectionCalls = fetchImpl.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
      );
      expect(collectionCalls).toHaveLength(1);

      const body = JSON.parse(collectionCalls[0]![1]?.body as string) as { data: Array<{ id: string }> };
      expect(body.data).toHaveLength(20);
    });

    it('makes zero API calls for empty input', async () => {
      const fetchImpl = vi.fn<typeof fetch>();
      const provider = createMockProvider(fetchImpl);

      await provider.saveTracks({ ids: [] });

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('throws on first failed sub-batch and does not continue', async () => {
      const trackIds = makeTrackIds(50);
      let successfulBatches = 0;

      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        // First batch (IDs 1-20) succeeds; second batch (IDs 21-40) always fails
        // (including transport retries), so the third batch is never reached.
        if (body.data[0]?.id === '1') {
          successfulBatches += 1;
          return jsonResponse(200, { data: [] });
        }
        return jsonResponse(400, {
          errors: [{ detail: 'Bad Request' }],
        });
      });
      const provider = createMockProvider(fetchImpl);

      await expect(provider.saveTracks({ ids: trackIds })).rejects.toThrow();

      expect(successfulBatches).toBe(1);

      // No IDs from the third batch (41-50) should have been sent
      const allSentIds = fetchImpl.mock.calls.flatMap(([, init]) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        return body.data.map((item) => item.id);
      });
      expect(allSentIds.every((id) => Number(id) <= 40)).toBe(true);
    });
  });

  describe('removeTracks', () => {
    it('sends 3 API calls for 50 track IDs (20 + 20 + 10)', async () => {
      const trackIds = makeTrackIds(50);

      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: [] }));
      const provider = createMockProvider(fetchImpl);

      await provider.removeTracks({ ids: trackIds });

      const collectionCalls = fetchImpl.mock.calls.filter(
        ([, init]) => init?.method === 'DELETE',
      );
      expect(collectionCalls).toHaveLength(3);

      const batchSizes = collectionCalls.map(([, init]) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        return body.data.length;
      });
      expect(batchSizes).toEqual([20, 20, 10]);
    });

    it('makes zero API calls for empty input', async () => {
      const fetchImpl = vi.fn<typeof fetch>();
      const provider = createMockProvider(fetchImpl);

      await provider.removeTracks({ ids: [] });

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('throws on first failed sub-batch and does not continue', async () => {
      const trackIds = makeTrackIds(50);
      let successfulBatches = 0;

      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        // First batch (IDs 1-20) succeeds; second batch (IDs 21-40) always fails
        if (body.data[0]?.id === '1') {
          successfulBatches += 1;
          return jsonResponse(200, { data: [] });
        }
        return jsonResponse(400, {
          errors: [{ detail: 'Bad Request' }],
        });
      });
      const provider = createMockProvider(fetchImpl);

      await expect(provider.removeTracks({ ids: trackIds })).rejects.toThrow();

      expect(successfulBatches).toBe(1);

      // No IDs from the third batch (41-50) should have been sent
      const allSentIds = fetchImpl.mock.calls.flatMap(([, init]) => {
        const body = JSON.parse(init?.body as string) as { data: Array<{ id: string }> };
        return body.data.map((item) => item.id);
      });
      expect(allSentIds.every((id) => Number(id) <= 40)).toBe(true);
    });
  });
});

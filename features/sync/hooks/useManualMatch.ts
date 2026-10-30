'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { scoreCandidate } from '@/lib/matching/scoring';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import { SYNC_PAIRS_KEY } from '@features/sync/hooks/useSyncPairs';

const MATCH_SEARCH_LIMIT = 20;
const MATCH_RESULTS_SHOWN = 8;

export interface ManualMatchSource {
  title: string;
  artists: string[];
  durationMs: number;
}

export interface ScoredMatch {
  track: Track;
  score: number;
}

export function buildManualMatchQuery(source: ManualMatchSource): string {
  return [source.title, source.artists[0] ?? ''].join(' ').trim();
}

/** Ranks search results by how well they match the unresolved track. */
export function rankManualMatches(source: ManualMatchSource, tracks: Track[]): ScoredMatch[] {
  const payload = {
    title: source.title,
    artists: source.artists,
    normalizedArtists: source.artists.map((artist) => artist.toLowerCase()),
    album: null,
    durationSec: Math.round(source.durationMs / 1000),
  };

  return tracks
    .filter((track) => !!track.id)
    .map((track) => ({ track, score: scoreCandidate(payload, track).score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MATCH_RESULTS_SHOWN);
}

export function useManualMatchSearch(source: ManualMatchSource, provider: MusicProviderId, query: string) {
  return useQuery({
    queryKey: ['sync-manual-match', provider, query],
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ provider, q: query.trim(), limit: String(MATCH_SEARCH_LIMIT) });
      const result = await apiFetch<{ tracks: Track[] }>(`/api/search/tracks?${params.toString()}`);
      return rankManualMatches(source, result.tracks ?? []);
    },
  });
}

/** Saves a hand-picked match so every future sync uses it. */
export function useSaveManualMatch() {
  return useMutation({
    mutationFn: async (input: { canonicalTrackId: string; provider: MusicProviderId; providerTrackId: string }) =>
      apiFetch<{ providerTrackId: string }>('/api/sync/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
  });
}

/** Leaves a track out of a sync pair's syncs, or brings it back. */
export function useSetTrackSkipped() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { syncPairId: string; canonicalTrackId: string; skipped: boolean }) =>
      apiFetch<{ skippedCanonicalIds: string[] }>(`/api/sync/pairs/${input.syncPairId}/skipped`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalTrackId: input.canonicalTrackId, skipped: input.skipped }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SYNC_PAIRS_KEY });
    },
  });
}

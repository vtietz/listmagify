import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Resolver = typeof import('@/lib/resolver/canonicalResolver');

let resolver: Resolver;
let closeRecsDb: () => void;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'recs-manual-'));
  vi.stubEnv('RECS_ENABLED', 'true');
  vi.stubEnv('RECS_DB_PATH', join(dir, 'recs.db'));
  vi.resetModules();
  resolver = await import('@/lib/resolver/canonicalResolver');
  ({ closeRecsDb } = await import('@/lib/recs/db'));
});

afterAll(() => {
  closeRecsDb();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function resolveSpotifyLovefool() {
  return resolver.fromProviderTrack({
    provider: 'spotify',
    providerTrackId: 'sp-lovefool',
    title: 'Lovefool',
    artists: ['The Cardigans'],
    durationMs: 194_000,
    isrc: 'SEBKB9629380',
  }).canonicalTrackId;
}

describe('manual provider mappings', () => {
  it('keeps a manual mapping even when the picked release has a different ISRC', () => {
    const canonicalId = resolveSpotifyLovefool();
    resolver.setManualProviderMapping({ provider: 'tidal', providerTrackId: 'td-live', canonicalTrackId: canonicalId });

    // Reading the TIDAL playlist later resolves the picked track back to the same canonical track
    const result = resolver.fromProviderTrack({
      provider: 'tidal',
      providerTrackId: 'td-live',
      title: 'Lovefool (Live in Stockholm)',
      artists: ['The Cardigans'],
      durationMs: 260_000,
      isrc: 'SELIVE000001',
    });

    expect(result.canonicalTrackId).toBe(canonicalId);
    expect(resolver.lookupCanonicalTrackIds('tidal', ['td-live']).get('td-live')).toBe(canonicalId);
  });

  it('prefers the manual mapping over newer automatic ones', () => {
    const canonicalId = resolveSpotifyLovefool();
    resolver.upsertProviderMap({
      provider: 'tidal',
      providerTrackId: 'td-auto',
      canonicalTrackId: canonicalId,
      matchScore: 1,
      confidence: 'high',
    });

    expect(resolver.toProviderTrack('tidal', canonicalId)?.providerTrackId).toBe('td-live');
  });

  it('is never overwritten by automatic matching', () => {
    const canonicalId = resolveSpotifyLovefool();
    resolver.upsertProviderMap({
      provider: 'tidal',
      providerTrackId: 'td-live',
      canonicalTrackId: 'some-other-canonical',
      matchScore: 0.9,
      confidence: 'high',
    });

    expect(resolver.lookupCanonicalTrackIds('tidal', ['td-live']).get('td-live')).toBe(canonicalId);
  });
});

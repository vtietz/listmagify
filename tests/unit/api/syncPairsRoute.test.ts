import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
  current: { providerAccountIds: { spotify: 'owner' } } as Record<string, unknown>,
}));

vi.mock('@/app/api/_shared/guard', () => ({
  assertAuthenticated: vi.fn(async () => sessionState.current),
}));

type Route = typeof import('@/app/api/sync/pairs/route');

let route: Route;
let closeRecsDb: () => void;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'recs-sync-pairs-route-'));
  vi.stubEnv('RECS_ENABLED', 'true');
  vi.stubEnv('RECS_DB_PATH', join(dir, 'recs.db'));
  vi.resetModules();
  route = await import('@/app/api/sync/pairs/route');
  ({ closeRecsDb } = await import('@/lib/recs/db'));
});

afterAll(() => {
  closeRecsDb();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function postPair(sourcePlaylistId: string, targetPlaylistId: string) {
  const request = new Request('http://localhost/api/sync/pairs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProvider: 'tidal',
      sourcePlaylistId,
      sourcePlaylistName: 'Source',
      targetProvider: 'spotify',
      targetPlaylistId,
      targetPlaylistName: 'Target',
      direction: 'bidirectional',
      syncInterval: 'off',
    }),
  });
  return route.POST(request as unknown as NextRequest);
}

describe('POST /api/sync/pairs', () => {
  it('returns 409 instead of a database error when the pair already exists', async () => {
    sessionState.current = { providerAccountIds: { spotify: 'owner' } };

    expect((await postPair('td-1', 'sp-1')).status).toBe(201);

    const duplicate = await postPair('td-1', 'sp-1');
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: 'Sync pair already exists',
      detail: 'These playlists are already saved as a sync pair',
    });
  });

  it('reports a conflict when another account already syncs the same playlists', async () => {
    sessionState.current = { providerAccountIds: { spotify: 'first' } };
    expect((await postPair('td-2', 'sp-2')).status).toBe(201);

    sessionState.current = { providerAccountIds: { spotify: 'second' } };
    const duplicate = await postPair('td-2', 'sp-2');
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      detail: 'These playlists are already synced by another account',
    });
  });

  it('rejects a pair when one of the playlists is already in another of the user\'s pairs', async () => {
    sessionState.current = { providerAccountIds: { spotify: 'chain-owner' } };
    expect((await postPair('td-3', 'sp-3')).status).toBe(201);

    const sourceReused = await postPair('td-3', 'sp-4');
    expect(sourceReused.status).toBe(409);
    expect(await sourceReused.json()).toMatchObject({
      error: 'Playlist already synced',
      detail: '"Source" is already part of another sync pair',
    });

    const targetReused = await postPair('td-4', 'sp-3');
    expect(targetReused.status).toBe(409);
    expect(await targetReused.json()).toMatchObject({
      detail: '"Target" is already part of another sync pair',
    });
  });

  it('allows another account to sync one of the same playlists to a different counterpart', async () => {
    sessionState.current = { providerAccountIds: { spotify: 'chain-first' } };
    expect((await postPair('td-5', 'sp-5')).status).toBe(201);

    sessionState.current = { providerAccountIds: { spotify: 'chain-second' } };
    expect((await postPair('td-5', 'sp-6')).status).toBe(201);
  });

  it('does not treat an account ID as owning pairs of a longer, overlapping ID', async () => {
    sessionState.current = { providerAccountIds: { spotify: 'abc123' } };
    expect((await postPair('td-7', 'sp-7')).status).toBe(201);

    sessionState.current = { providerAccountIds: { spotify: 'abc' } };
    const listed = await (await route.GET()).json() as { pairs: unknown[] };
    expect(listed.pairs).toHaveLength(0);
    expect((await postPair('td-7', 'sp-8')).status).toBe(201);
  });
});

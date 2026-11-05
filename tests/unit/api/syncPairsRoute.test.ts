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
});

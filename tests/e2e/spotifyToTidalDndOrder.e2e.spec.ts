import { expect, test, type Locator, type Page } from '@playwright/test';

type AddPayload = {
  trackUris?: string[];
  position?: number;
};

const LAYOUT = '/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2~r-t!';

async function ensureTidalSignedIn(_page: Page, tidalPanel: Locator) {
  const overlay = tidalPanel.locator('[data-testid="panel-auth-overlay"]');
  if (await overlay.isVisible()) {
    await tidalPanel.getByRole('button', { name: 'Sign in with TIDAL' }).click();
    await expect(overlay).toBeHidden({ timeout: 20_000 });
  }
}

async function dragToPanel({
  page,
  source,
  target,
}: {
  page: Page;
  source: Locator;
  target: Locator;
}) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Could not determine source/target bounds for drag operation');
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 30, sourceY + 8, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

async function getTidalTrackUris(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const response = await fetch('/api/playlists/test-playlist-2/tracks?provider=tidal&limit=100');
    if (!response.ok) {
      throw new Error(`Failed to fetch destination tracks: ${response.status}`);
    }

    const payload = await response.json() as {
      tracks?: Array<{ uri?: string | null }>;
    };

    return (payload.tracks ?? [])
      .map((track) => track.uri ?? '')
      .filter((uri) => uri.length > 0);
  });
}

test.describe('Spotify to TIDAL drag/drop ordering', () => {
  test('keeps relative order in persisted TIDAL playlist after reload', async ({ page }) => {
    test.setTimeout(120_000);

    await page.route('**/api/search/tracks**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('provider') !== 'tidal') {
        await route.continue();
        return;
      }

      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const mappedTrackId = query.includes('track 2') ? 'tidal-track-2' : 'tidal-track-1';
      const mappedTrackName = query.includes('track 2') ? 'Test Track 2' : 'Test Track 1';
      const mappedArtistName = query.includes('track 2') ? 'Test Artist 2' : 'Test Artist 1';
      const mappedAlbumName = query.includes('track 2') ? 'Test Album 2' : 'Test Album 1';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: [
            {
              id: mappedTrackId,
              uri: `tidal:track:${mappedTrackId}`,
              name: mappedTrackName,
              artists: [mappedArtistName],
              durationMs: 180_000,
              album: { name: mappedAlbumName, image: null },
            },
          ],
          total: 1,
          nextOffset: null,
        }),
      });
    });

    await page.goto(LAYOUT);

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 20_000 });

    const spotifyPanel = panels.nth(0);
    const tidalPanel = panels.nth(1);

    await ensureTidalSignedIn(page, tidalPanel);

    const spotifyTrack1 = spotifyPanel.getByText('Test Track 1').first();
    const spotifyTrack2 = spotifyPanel.getByText('Test Track 2').first();
    const spotifyScroll = spotifyPanel.locator('[data-testid="track-list-scroll"]');
    const tidalScroll = tidalPanel.locator('[data-testid="track-list-scroll"]');

    await expect(spotifyTrack1).toBeVisible({ timeout: 20_000 });
    await expect(spotifyTrack2).toBeVisible({ timeout: 20_000 });
    await expect(spotifyScroll).toBeVisible({ timeout: 20_000 });
    await expect(tidalScroll).toBeVisible({ timeout: 20_000 });

    await spotifyTrack1.click();
    await spotifyTrack2.click({ modifiers: ['Control'] });

    const addPayloads: AddPayload[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') {
        return;
      }

      const url = new URL(request.url());
      if (
        url.pathname === '/api/playlists/test-playlist-2/tracks/add'
        && url.searchParams.get('provider') === 'tidal'
      ) {
        addPayloads.push((request.postDataJSON() ?? {}) as AddPayload);
      }
    });

    await dragToPanel({
      page,
      source: spotifyTrack1,
      target: tidalScroll,
    });

    await expect.poll(() => addPayloads.length, { timeout: 60_000 }).toBeGreaterThan(0);

    const addedUris = addPayloads.flatMap((payload) => payload.trackUris ?? []);
    expect(addedUris.length).toBeGreaterThan(0);

    let urisAfterAdd: string[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      urisAfterAdd = await getTidalTrackUris(page);
      if (addedUris.every((uri) => urisAfterAdd.includes(uri))) {
        break;
      }
      await page.waitForTimeout(500);
    }

    const missingAfterAdd = addedUris.filter((uri) => !urisAfterAdd.includes(uri));
    expect(missingAfterAdd, `Missing URIs after add. requested=${JSON.stringify(addedUris)} actual=${JSON.stringify(urisAfterAdd)}`).toEqual([]);

    await page.reload();
    await expect(page.locator('[data-testid="playlist-panel"]')).toHaveCount(2, { timeout: 20_000 });

    const urisAfterReload = await getTidalTrackUris(page);
    const missingAfterReload = addedUris.filter((uri) => !urisAfterReload.includes(uri));
    expect(missingAfterReload, `Missing URIs after reload. requested=${JSON.stringify(addedUris)} actual=${JSON.stringify(urisAfterReload)}`).toEqual([]);

    const addedIndices = addedUris.map((uri) => urisAfterReload.indexOf(uri));

    addedIndices.forEach((index) => {
      expect(index).toBeGreaterThanOrEqual(0);
    });

    for (let i = 0; i < addedIndices.length - 1; i += 1) {
      expect(addedIndices[i]).toBeLessThan(addedIndices[i + 1]!);
    }

    // Keep this assertion so failures show the exact request ordering we submitted.
    expect(addedUris.join('|')).toContain('tidal:track:');

  });
});

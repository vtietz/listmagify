import { test, expect } from '@playwright/test';

test.describe('Add To Marked Button', () => {
  test('uses marker insertion flow when same-playlist marker is active', async ({ page }) => {
    await page.goto('/split-editor?layout=p.test-playlist-1');

    await expect(page.getByText('Test Track 1').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByRole('button', { name: /Add marker after/ }).click();

    const addButton = page.getByRole('button', { name: /Add Test Track 1 to \d+ marked insertion points/ });
    await expect(addButton).toBeVisible();

    await addButton.click();

    await expect(page.getByRole('alertdialog').getByText('Track already exists')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Add to playlist' })).toHaveCount(0);
  });

  test('matches Spotify browse tracks before adding to TIDAL markers', async ({ page }) => {
    const spotifyAddRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') {
        return;
      }

      const url = new URL(request.url());
      if (
        url.pathname === '/api/playlists/test-playlist-2/tracks/add'
        && url.searchParams.get('provider') === 'spotify'
      ) {
        spotifyAddRequests.push(request.url());
      }
    });

    await page.route('**/api/search/tracks**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const provider = requestUrl.searchParams.get('provider');

      if (provider === 'tidal') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tracks: [
              {
                id: 'tidal-track-1',
                uri: 'tidal:track:tidal-track-1',
                name: 'Mock Search Track 1',
                artists: ['Test Artist 1'],
                durationMs: 180000,
                album: { name: 'Test Album 1', image: null },
              },
            ],
            total: 1,
            nextOffset: null,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: [
            {
              id: 'track1',
              uri: 'spotify:track:track1',
              name: 'Mock Search Track 1',
              artists: ['Test Artist 1'],
              durationMs: 180000,
              album: { name: 'Test Album 1', image: null },
            },
          ],
          total: 1,
          nextOffset: null,
        }),
      });
    });

    await page.goto('/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2~r-t!');

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 20_000 });

    const tidalPanel = panels.nth(1);
    const tidalOverlay = tidalPanel.locator('[data-testid="panel-auth-overlay"]');
    if (await tidalOverlay.isVisible()) {
      await tidalPanel.getByRole('button', { name: 'Sign in with TIDAL' }).click();
      await expect(tidalOverlay).toBeHidden({ timeout: 20_000 });
    }

    await expect(tidalPanel.getByText('TIDAL Track 6').first()).toBeVisible({ timeout: 20_000 });
    await tidalPanel.getByRole('button', { name: 'More options' }).first().click();
    await page.getByRole('button', { name: /Add marker after/ }).click();

    await page.getByRole('button', { name: 'Browse' }).click();

    const searchInput = page.getByPlaceholder('Search tracks, artists, albums...');
    await expect(searchInput).toBeVisible({ timeout: 20_000 });
    await searchInput.fill('Track 1');

    const searchRow = page.getByText('Mock Search Track 1').first();
    await expect(searchRow).toBeVisible({ timeout: 20_000 });
    await searchRow.click();

    const addRequestPromise = page.waitForRequest(
      (request) => {
        if (request.method() !== 'POST') {
          return false;
        }

        const url = new URL(request.url());
        return url.pathname === '/api/playlists/test-playlist-2/tracks/add'
          && url.searchParams.get('provider') === 'tidal';
      },
      { timeout: 10_000 },
    );

    const searchInputBar = searchInput.locator('xpath=ancestor::div[contains(@class,"relative flex items-center gap-1.5")]');
    const addToMarkersButton = searchInputBar.locator('button:has(svg.lucide-plus)').first();
    await expect(addToMarkersButton).toBeEnabled({ timeout: 10_000 });
    await addToMarkersButton.click();

    const addRequest = await addRequestPromise;
    const payload = addRequest.postDataJSON() as { trackUris?: string[] };

    expect(payload.trackUris).toEqual(['tidal:track:tidal-track-1']);

    expect(spotifyAddRequests.length).toBe(0);
    await expect(page.getByRole('alertdialog').getByText('Invalid request')).toHaveCount(0);
  });

  test('matches Spotify browse tracks before context-menu add to TIDAL markers', async ({ page }) => {
    const spotifyAddRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST') {
        return;
      }

      const url = new URL(request.url());
      if (
        url.pathname === '/api/playlists/test-playlist-2/tracks/add'
        && url.searchParams.get('provider') === 'spotify'
      ) {
        spotifyAddRequests.push(request.url());
      }
    });

    await page.route('**/api/search/tracks**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const provider = requestUrl.searchParams.get('provider');

      if (provider === 'tidal') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tracks: [
              {
                id: 'tidal-track-2',
                uri: 'tidal:track:tidal-track-2',
                name: 'Mock Search Track 2',
                artists: ['Test Artist 2'],
                durationMs: 190000,
                album: { name: 'Test Album 2', image: null },
              },
            ],
            total: 1,
            nextOffset: null,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: [
            {
              id: 'track2',
              uri: 'spotify:track:track2',
              name: 'Mock Search Track 2',
              artists: ['Test Artist 2'],
              durationMs: 190000,
              album: { name: 'Test Album 2', image: null },
            },
          ],
          total: 1,
          nextOffset: null,
        }),
      });
    });

    await page.goto('/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2~r-t!');

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 20_000 });

    const tidalPanel = panels.nth(1);
    const tidalOverlay = tidalPanel.locator('[data-testid="panel-auth-overlay"]');
    if (await tidalOverlay.isVisible()) {
      await tidalPanel.getByRole('button', { name: 'Sign in with TIDAL' }).click();
      await expect(tidalOverlay).toBeHidden({ timeout: 20_000 });
    }

    await expect(tidalPanel.getByText('TIDAL Track 6').first()).toBeVisible({ timeout: 20_000 });
    await tidalPanel.getByRole('button', { name: 'More options' }).first().click();
    await page.getByRole('button', { name: /Add marker after/ }).click();

    await page.getByRole('button', { name: 'Browse' }).click();

    const searchInput = page.getByPlaceholder('Search tracks, artists, albums...');
    await expect(searchInput).toBeVisible({ timeout: 20_000 });
    await searchInput.fill('Track 2');

    const searchRow = page.getByText('Mock Search Track 2').first();
    await expect(searchRow).toBeVisible({ timeout: 20_000 });

    const addRequestPromise = page.waitForRequest(
      (request) => {
        if (request.method() !== 'POST') {
          return false;
        }

        const url = new URL(request.url());
        return url.pathname === '/api/playlists/test-playlist-2/tracks/add'
          && url.searchParams.get('provider') === 'tidal';
      },
      { timeout: 10_000 },
    );

    await searchRow.click({ button: 'right' });
    await page.getByRole('button', { name: 'Add to markers' }).click();

    const addRequest = await addRequestPromise;
    const payload = addRequest.postDataJSON() as { trackUris?: string[] };

    expect(payload.trackUris).toEqual(['tidal:track:tidal-track-2']);
    expect(spotifyAddRequests.length).toBe(0);
    await expect(page.getByRole('alertdialog').getByText('Invalid request')).toHaveCount(0);
  });
});

import { test, expect, type Page } from '@playwright/test';

async function loginTidal(page: Page) {
  const response = await page.goto('/api/test/login?provider=tidal');
  expect(response?.ok()).toBeTruthy();
}

async function gotoTidalPlaylistAndWaitForTracks(page: Page, playlistId = 'test-playlist-1') {
  await loginTidal(page);

  const tracksResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new RegExp(`/api/playlists/${playlistId}/tracks(?:\\?|$)`).test(response.url()) &&
      response.status() === 200,
    { timeout: 20_000 },
  );

  await page.goto(`/split-editor?layout=p.${playlistId}~r-t`);
  await tracksResponse;
}

test.describe('TIDAL Smoke Tests', () => {
  test('should display TIDAL track titles in playlist panel', async ({ page }) => {
    await gotoTidalPlaylistAndWaitForTracks(page);

    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('TIDAL Track 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Track 3').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Track 5').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should display TIDAL artist names', async ({ page }) => {
    await gotoTidalPlaylistAndWaitForTracks(page);

    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('TIDAL Artist 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Artist 2').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Artist 3').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should display TIDAL album names', async ({ page }) => {
    await gotoTidalPlaylistAndWaitForTracks(page);

    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('TIDAL Album 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Album 2').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should show all fixture tracks in second TIDAL playlist', async ({ page }) => {
    await gotoTidalPlaylistAndWaitForTracks(page, 'test-playlist-2');

    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // test-playlist-2 has tracks 6-10
    await expect(page.getByText('TIDAL Track 6').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Artist 5').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Album 5').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('TIDAL Track 10').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should render two TIDAL panels side by side with independent tracks', async ({ page }) => {
    await loginTidal(page);

    const tracksResponse1 = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/api\/playlists\/test-playlist-1\/tracks(?:\?|$)/.test(response.url()) &&
        response.status() === 200,
      { timeout: 20_000 },
    );
    const tracksResponse2 = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/api\/playlists\/test-playlist-2\/tracks(?:\?|$)/.test(response.url()) &&
        response.status() === 200,
      { timeout: 20_000 },
    );

    await page.goto('/split-editor?layout=h_p.test-playlist-1~r-t.p.test-playlist-2~r-t!');
    await Promise.all([tracksResponse1, tracksResponse2]);

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 15_000 });

    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);

    // Panel 1: tracks 1-5
    await expect(panelOne.getByText('TIDAL Track 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(panelOne.getByText('TIDAL Artist 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(panelOne.getByText('TIDAL Album 1').first()).toBeVisible({ timeout: 20_000 });

    // Panel 2: tracks 6-10
    await expect(panelTwo.getByText('TIDAL Track 6').first()).toBeVisible({ timeout: 20_000 });
    await expect(panelTwo.getByText('TIDAL Artist 5').first()).toBeVisible({ timeout: 20_000 });
    await expect(panelTwo.getByText('TIDAL Album 5').first()).toBeVisible({ timeout: 20_000 });
  });
});

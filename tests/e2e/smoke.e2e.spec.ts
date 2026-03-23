import { test, expect, type Page } from '@playwright/test';

async function gotoSplitEditorAndWaitForTracks(page: Page) {
  const tracksResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /\/api\/playlists\/test-playlist-1\/tracks(?:\?|$)/.test(response.url()) &&
      response.status() === 200,
    { timeout: 20_000 }
  );

  await page.goto('/split-editor?layout=p.test-playlist-1');
  await tracksResponse;
}

test.describe('E2E Smoke Tests', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Listmagify/);
  });

  test('should display playlists on index page', async ({ page }) => {
    await page.goto('/playlists');

    // Page header
    await expect(page.getByRole('heading', { name: 'Your Playlists' })).toBeVisible({ timeout: 15_000 });

    // Mock API returns 2 playlists rendered as cards
    await expect(page.getByText('Test Playlist 1').first()).toBeVisible();
    await expect(page.getByText('Test Playlist 2').first()).toBeVisible();
  });

  test('should open split-editor with a playlist', async ({ page }) => {
    await gotoSplitEditorAndWaitForTracks(page);

    // Wait for the playlist panel to appear
    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // Verify track content from fixture (5 tracks)
    await expect(page.getByText('Test Track 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Test Artist 1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should show all fixture tracks in split-editor', async ({ page }) => {
    await gotoSplitEditorAndWaitForTracks(page);

    // Wait for panel to load
    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // The track list uses role="listbox"
    const trackList = page.locator('[role="listbox"]').first();
    await expect(trackList).toBeVisible();

    // Fixture has 5 tracks — verify several are rendered
    await expect(page.getByText('Test Track 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Test Track 3').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Test Track 5').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should delete duplicates while keeping first occurrence', async ({ page }) => {
    let duplicatePosition: number | null = null;
    let firstTrackPosition: number | null = null;
    let didInjectDuplicate = false;

    await page.route('**/api/playlists/test-playlist-1/tracks**', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        await route.continue();
        return;
      }

      const upstream = await route.fetch();
      const data = (await upstream.json()) as {
        tracks?: Array<Record<string, unknown>>;
        total?: number;
      };

      if (!didInjectDuplicate && Array.isArray(data.tracks) && data.tracks.length > 0) {
        const firstTrack = data.tracks[0];
        if (firstTrack) {
          const positions = data.tracks.map((track, index) => {
            const position = track.position;
            return typeof position === 'number' ? position : index;
          });
          const maxPosition = positions.length > 0 ? Math.max(...positions) : 0;
          const basePosition = typeof firstTrack.position === 'number' ? firstTrack.position : 0;

          firstTrackPosition = basePosition;
          duplicatePosition = maxPosition + 1;
          data.tracks = [...data.tracks, { ...firstTrack, position: duplicatePosition }];
          data.total = data.tracks.length;
          didInjectDuplicate = true;
        }
      }

      await route.fulfill({
        status: upstream.status(),
        headers: {
          ...upstream.headers(),
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    });

    await page.route('**/api/playlists/test-playlist-1/tracks/remove**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ snapshotId: 'test-snapshot-duplicate-delete' }),
      });
    });

    await gotoSplitEditorAndWaitForTracks(page);

    await expect(page.getByText('Test Track 1')).toHaveCount(2, { timeout: 20_000 });

    const deleteRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        /\/api\/playlists\/test-playlist-1\/tracks\/remove(?:\?|$)/.test(request.url()),
      { timeout: 10_000 }
    );

    await page.locator('[title="Delete duplicates"]').first().click();

    const deleteRequest = await deleteRequestPromise;
    const payload = deleteRequest.postDataJSON() as {
      tracks?: Array<{ uri?: string; positions?: number[]; position?: number }>;
    };

    const duplicateTrackPayload = payload.tracks?.find((track) => track.uri === 'spotify:track:track1');

    if (firstTrackPosition === null || duplicatePosition === null || !duplicateTrackPayload) {
      throw new Error('Duplicate setup or delete payload was not captured correctly');
    }

    expect(duplicateTrackPayload.positions).toEqual([duplicatePosition]);
    expect(duplicateTrackPayload.positions).not.toContain(firstTrackPosition);
    expect(Object.prototype.hasOwnProperty.call(duplicateTrackPayload, 'position')).toBe(false);
  });
});

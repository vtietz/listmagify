import { test, expect } from '@playwright/test';

const TWO_PANEL_LAYOUT = '/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2!';

test.describe('Cross-Panel Split Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TWO_PANEL_LAYOUT);
    await expect(page.locator('[data-testid="playlist-panel"]')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText('Test Playlist 1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Test Playlist 2').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should hydrate two panels from URL layout', async ({ page }) => {
    const panels = page.locator('[data-testid="playlist-panel"]');

    await expect(panels).toHaveCount(2);
    await expect(page.getByText('Test Playlist 1').first()).toBeVisible();
    await expect(page.getByText('Test Playlist 2').first()).toBeVisible();
  });

  test('should render independent tracks in each panel', async ({ page }) => {
    const panels = page.locator('[data-testid="playlist-panel"]');
    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);

    await expect(panelOne.locator('[data-testid="track-list-scroll"]')).toBeVisible();
    await expect(panelTwo.locator('[data-testid="track-list-scroll"]')).toBeVisible();

    await expect(panelOne.getByText('Test Track 1').first()).toBeVisible();
    await expect(panelTwo.getByText('Test Track 6').first()).toBeVisible();
  });

  test('should preserve multi-panel layout on reload', async ({ page }) => {
    await page.reload();

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText('Test Playlist 1').first()).toBeVisible();
    await expect(page.getByText('Test Playlist 2').first()).toBeVisible();
  });

  test('should highlight target panel while dragging track across panels', async ({ page }) => {
    const panels = page.locator('[data-testid="playlist-panel"]');
    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);
    const panelOneScroll = panelOne.locator('[data-testid="track-list-scroll"]');

    const sourceRow = panelTwo.getByText('Test Track 6').first();
    await expect(sourceRow).toBeVisible({ timeout: 20_000 });
    await expect(panelOneScroll).toBeVisible();

    const sourceBox = await sourceRow.boundingBox();
    const targetBox = await panelOneScroll.boundingBox();
    if (!sourceBox || !targetBox) {
      throw new Error('Failed to locate source row or target panel bounds');
    }

    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + targetBox.height / 2;

    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 30, sourceY + 8, { steps: 4 });
    await page.mouse.move(targetX, targetY, { steps: 12 });

    await expect(panelOne).toHaveClass(/border-primary/);

    await page.mouse.up();
  });

  test('should send add-tracks mutation after cross-panel drop', async ({ page }) => {
    const panels = page.locator('[data-testid="playlist-panel"]');
    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);
    const panelOneScroll = panelOne.locator('[data-testid="track-list-scroll"]');

    const sourceRow = panelTwo.getByText('Test Track 6').first();
    await expect(sourceRow).toBeVisible({ timeout: 20_000 });
    await expect(panelOneScroll).toBeVisible();

    const sourceBox = await sourceRow.boundingBox();
    const targetBox = await panelOneScroll.boundingBox();
    if (!sourceBox || !targetBox) {
      throw new Error('Failed to locate source row or target panel bounds');
    }

    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + targetBox.height / 2;

    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    await page.mouse.move(sourceX + 30, sourceY + 8, { steps: 4 });
    await page.mouse.move(targetX, targetY, { steps: 12 });

    const addRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        /\/api\/playlists\/test-playlist-1\/tracks\/add(?:\?|$)/.test(request.url()),
      { timeout: 10_000 }
    );

    await page.mouse.up();

    const addRequest = await addRequestPromise;
    const postData = addRequest.postDataJSON() as { trackUris?: string[]; position?: number };

    expect(Array.isArray(postData.trackUris)).toBeTruthy();
    expect(postData.trackUris?.length ?? 0).toBeGreaterThan(0);
  });

  test('should reflect edited playlist name immediately without reload', async ({ page }) => {
    const updatedName = 'Renamed Playlist 1';
    let wasUpdated = false;

    await page.route('**/api/playlists/test-playlist-1', async (route) => {
      const request = route.request();

      if (request.method() === 'PUT') {
        wasUpdated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
        return;
      }

      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'test-playlist-1',
            name: wasUpdated ? updatedName : 'Test Playlist 1',
            description: 'Mock playlist used for e2e testing',
            owner: { id: 'test-user-id', displayName: 'Test User' },
            collaborative: false,
            tracksTotal: 5,
            isPublic: true,
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/me/playlists**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'test-playlist-1',
              name: wasUpdated ? updatedName : 'Test Playlist 1',
              description: 'Mock playlist used for e2e testing',
              ownerName: 'Test User',
              owner: { id: 'test-user-id', displayName: 'Test User' },
              image: null,
              tracksTotal: 5,
              isPublic: true,
            },
            {
              id: 'test-playlist-2',
              name: 'Test Playlist 2',
              description: 'Another mock playlist for e2e testing',
              ownerName: 'Test User',
              owner: { id: 'test-user-id', displayName: 'Test User' },
              image: null,
              tracksTotal: 5,
              isPublic: true,
            },
          ],
          nextCursor: null,
          total: 2,
        }),
      });
    });

    const playlistMetaResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/api\/playlists\/test-playlist-1(?:\?|$)/.test(response.url()) &&
        response.status() === 200,
      { timeout: 20_000 }
    );

    await page.goto('/split-editor?layout=p.test-playlist-1');
    await playlistMetaResponse;

    const selectorButton = page.locator('button[title="Select playlist"]').first();
    await expect(selectorButton).toBeVisible();
    await expect(selectorButton).toContainText('Test Playlist 1', { timeout: 20_000 });

    const editButton = page.locator('[title="Edit playlist info"]').first();
    await expect(editButton).toBeVisible({ timeout: 20_000 });

    await editButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('#playlist-name').fill(updatedName);

    const updateRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        /\/api\/playlists\/test-playlist-1(?:\?|$)/.test(request.url()),
      { timeout: 10_000 }
    );

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await updateRequestPromise;

    await expect(selectorButton).toContainText(updatedName, { timeout: 15_000 });
  });
});

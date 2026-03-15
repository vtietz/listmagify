import { test, expect } from '@playwright/test';

const TWO_PANEL_LAYOUT = '/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2!';

test.describe('Cross-Panel Split Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TWO_PANEL_LAYOUT);
    await expect(page.locator('[data-testid="playlist-panel"]')).toHaveCount(2, { timeout: 15_000 });
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

    const sourceRow = panelTwo.locator('div[id^="option-"]').filter({ hasText: 'Test Track 6' }).first();
    await expect(sourceRow).toBeVisible();
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

    const sourceRow = panelTwo.locator('div[id^="option-"]').filter({ hasText: 'Test Track 6' }).first();
    await expect(sourceRow).toBeVisible();
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
});

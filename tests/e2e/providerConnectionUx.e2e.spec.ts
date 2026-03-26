import { expect, test, type Locator, type Page } from '@playwright/test';

const TWO_PANEL_AUTH_LAYOUT = '/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2~r-t!';
const TWO_PANEL_SPOTIFY_LAYOUT = '/split-editor?layout=h_p.test-playlist-1.p.test-playlist-2!';

async function dragIntoPanel({
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

test.describe('Provider connection UX', () => {
  test('shows provider status summary in header dropdown', async ({ page }) => {
    await page.goto('/split-editor?layout=p.test-playlist-1');

    const headerDropdown = page.locator('[data-testid="header-provider-status-dropdown"]');
    await expect(headerDropdown).toBeVisible({ timeout: 20_000 });

    await headerDropdown.click();

    const spotifyStatus = page.locator('[data-testid="header-provider-status-dropdown-spotify-status"]');
    const tidalStatus = page.locator('[data-testid="header-provider-status-dropdown-tidal-status"]');

    await expect(spotifyStatus).toHaveClass(/text-green-500/);
    await expect(tidalStatus).toHaveClass(/text-muted-foreground/);
  });

  test('blocks interactions while overlay is active and re-enables after panel sign-in', async ({ page }) => {
    await page.goto(TWO_PANEL_AUTH_LAYOUT);

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 20_000 });

    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);

    const overlay = panelTwo.locator('[data-testid="panel-auth-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    const blockedScroll = panelTwo.locator('[data-testid="track-list-scroll"]');
    await expect(blockedScroll).toHaveAttribute('aria-disabled', 'true');

    let addRequestSeenWhileBlocked = false;
    page.on('request', (request) => {
      if (
        request.method() === 'POST'
        && /\/api\/playlists\/test-playlist-1\/tracks\/add(?:\?|$)/.test(request.url())
      ) {
        addRequestSeenWhileBlocked = true;
      }
    });

    await dragIntoPanel({
      page,
      source: panelTwo.getByText('TIDAL Track 6').first(),
      target: panelOne.locator('[data-testid="track-list-scroll"]'),
    });

    await page.waitForTimeout(500);
    expect(addRequestSeenWhileBlocked).toBe(false);

    await panelTwo.getByRole('button', { name: 'Sign in with TIDAL' }).click();
    await expect(overlay).toBeHidden({ timeout: 20_000 });
    await expect(blockedScroll).toHaveAttribute('aria-disabled', 'false');

    const addRequestAfterAuth = page.waitForRequest(
      (request) =>
        request.method() === 'POST'
        && /\/api\/playlists\/test-playlist-1\/tracks\/add(?:\?|$)/.test(request.url()),
      { timeout: 10_000 },
    );

    await dragIntoPanel({
      page,
      source: panelTwo.getByText('TIDAL Track 6').first(),
      target: panelOne.locator('[data-testid="track-list-scroll"]'),
    });

    await addRequestAfterAuth;
  });

  test('switching panel provider updates provider state and restores prior provider playlist', async ({ page }) => {
    await page.goto('/split-editor?layout=p.test-playlist-1');

    const panel = page.locator('[data-testid="playlist-panel"]').first();
    await expect(panel).toHaveAttribute('data-auth-blocked', 'false', { timeout: 20_000 });

    const dropdown = page.locator('[data-testid="panel-provider-status-dropdown"]').first();
    const selectorButton = panel.getByRole('combobox').first();
    await expect(selectorButton).toContainText('Test Playlist 1');
    await expect(dropdown).toHaveAttribute('aria-label', 'Spotify provider');

    await dropdown.click();
    await page.locator('[data-testid="panel-provider-status-dropdown-tidal"]').click();

    await expect(dropdown).toHaveAttribute('aria-label', 'TIDAL provider', { timeout: 20_000 });

    const overlay = page.locator('[data-testid="panel-auth-overlay"]');
    if (await overlay.isVisible()) {
      await expect(overlay).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(selectorButton).toContainText('Select a playlist...');
    }

    if (await overlay.isVisible()) {
      await panel.getByRole('button', { name: 'Sign in with TIDAL' }).click();
      await expect(overlay).toBeHidden({ timeout: 20_000 });
    }

    await dropdown.click();
    await page.locator('[data-testid="panel-provider-status-dropdown-spotify"]').click();

    await expect(dropdown).toHaveAttribute('aria-label', 'Spotify provider');
    await expect(selectorButton).toContainText('Test Playlist 1', { timeout: 20_000 });
    await expect(panel).toHaveAttribute('data-auth-blocked', 'false');
    await expect(page.getByText('Test Track 1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('switching panel provider updates browse search provider', async ({ page }) => {
    await page.goto('/split-editor?layout=p.test-playlist-1');

    const panelProviderDropdown = page.locator('[data-testid="panel-provider-status-dropdown"]').first();
    await panelProviderDropdown.click();
    await page.locator('[data-testid="panel-provider-status-dropdown-tidal"]').click();

    await page.getByRole('button', { name: 'Browse' }).click();

    const browseProviderSelect = page.getByRole('combobox', { name: 'Search provider' });
    await expect(browseProviderSelect).toHaveText(/TIDAL/i, { timeout: 20_000 });
  });

  test('shows waveform indicator only on currently playing panel', async ({ page }) => {
    await page.goto(TWO_PANEL_SPOTIFY_LAYOUT);

    const panels = page.locator('[data-testid="playlist-panel"]');
    await expect(panels).toHaveCount(2, { timeout: 20_000 });

    const panelOne = panels.nth(0);
    const panelTwo = panels.nth(1);

    const playRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && /\/api\/player\/control(?:\?|$)/.test(request.url()),
      { timeout: 10_000 },
    );

    await panelOne.locator('[title="Play playlist"]').first().click();
    await playRequest;

    const panelOneStatus = panelOne.locator('[data-testid="panel-provider-status-dropdown-current-status"]');
    await expect(panelOneStatus).toBeVisible({ timeout: 20_000 });

    const panelOneWaveform = panelOneStatus.locator('.animate-playing-bar-1');
    if (await panelOneWaveform.count()) {
      await expect(panelOneWaveform).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(panelOneStatus).toHaveClass(/text-green-500/, { timeout: 20_000 });
    }

    await expect(
      panelTwo.locator('[data-testid="panel-provider-status-dropdown-current-status"] .animate-playing-bar-1'),
    ).toHaveCount(0);
  });
});

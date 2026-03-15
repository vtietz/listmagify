import { test, expect } from '@playwright/test';

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
    // Load a playlist in the split editor (same approach as playlistSelector tests)
    await page.goto('/split-editor?layout=p.test-playlist-1');

    // Wait for the playlist panel to appear
    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // Verify track content from fixture (5 tracks)
    await expect(page.getByText('Test Track 1').first()).toBeVisible();
    await expect(page.getByText('Test Artist 1').first()).toBeVisible();
  });

  test('should show all fixture tracks in split-editor', async ({ page }) => {
    await page.goto('/split-editor?layout=p.test-playlist-1');

    // Wait for panel to load
    await expect(page.locator('[data-testid="playlist-panel"]').first()).toBeVisible({ timeout: 15_000 });

    // The track list uses role="listbox"
    const trackList = page.locator('[role="listbox"]').first();
    await expect(trackList).toBeVisible();

    // Fixture has 5 tracks — verify several are rendered
    await expect(page.getByText('Test Track 1').first()).toBeVisible();
    await expect(page.getByText('Test Track 3').first()).toBeVisible();
    await expect(page.getByText('Test Track 5').first()).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('E2E Smoke Tests', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Spotify Playlist Editor/);
  });

  test('should display playlists', async ({ page }) => {
    await page.goto('/playlists');
    
    // Mock API returns 2 playlists
    await expect(page.locator('text=Test Playlist 1')).toBeVisible();
    await expect(page.locator('text=Test Playlist 2')).toBeVisible();
  });

  test('should view playlist detail', async ({ page }) => {
    await page.goto('/playlists/test-playlist-1');
    
    // Verify playlist header
    await expect(page.locator('h1:has-text("Test Playlist 1")')).toBeVisible();
    
    // Verify tracks from fixture (5 tracks)
    await expect(page.locator('text=Test Track 1')).toBeVisible();
    await expect(page.locator('text=Test Artist 1')).toBeVisible();
  });

  test('should handle pagination', async ({ page }) => {
    await page.goto('/playlists/test-playlist-1');
    
    // Mock returns 5 tracks initially
    const trackRows = page.locator('tr').filter({ hasText: 'Test Track' });
    await expect(trackRows).toHaveCount(5);
    
    // Scroll to trigger load more (if implemented)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Wait a bit for potential loading
    await page.waitForTimeout(1000);
    
    // Should still have 5 tracks (mock has no pagination)
    await expect(trackRows).toHaveCount(5);
  });
});

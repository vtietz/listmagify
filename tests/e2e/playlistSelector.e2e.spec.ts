import { test, expect } from '@playwright/test';

test.describe('Playlist Selector Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to split editor page
    await page.goto('/split-editor');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should show dropdown button with placeholder text initially', async ({ page }) => {
    // Find the playlist selector button
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    
    // Should be visible
    await expect(selectorButton).toBeVisible();
    
    // Should show placeholder text
    await expect(selectorButton).toContainText('Select a playlist...');
  });

  test('should open dropdown when clicking the button', async ({ page }) => {
    // Click the selector button
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Dropdown should be visible (rendered in portal)
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeVisible();
    
    // Should show loading or playlists
    // Wait for either loading text or playlist items
    await expect(
      page.locator('text=Loading...').or(page.locator('text=Test Playlist'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show playlists in the dropdown', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Wait for playlists to load (mock returns Test Playlist 1 and Test Playlist 2)
    await expect(page.locator('text=Test Playlist 1')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Test Playlist 2')).toBeVisible({ timeout: 5000 });
  });

  test('should filter playlists when typing in search', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Wait for playlists to load
    await expect(page.locator('text=Test Playlist 1')).toBeVisible({ timeout: 5000 });
    
    // Type in search box
    const searchInput = page.getByPlaceholder('Search playlists...');
    await searchInput.fill('Playlist 1');
    
    // Should show only matching playlist
    await expect(page.locator('text=Test Playlist 1')).toBeVisible();
    
    // Test Playlist 2 should not be visible
    await expect(page.locator('text=Test Playlist 2')).not.toBeVisible();
  });

  test('should select a playlist and show its name in the button', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Wait for playlists and click on "Test Playlist 1"
    const playlist1 = page.locator('button:has-text("Test Playlist 1")').first();
    await expect(playlist1).toBeVisible({ timeout: 5000 });
    await playlist1.click();
    
    // Dropdown should close
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).not.toBeVisible();
    
    // Button should now show the selected playlist name
    await expect(selectorButton).toContainText('Test Playlist 1');
  });

  test('should close dropdown when clicking outside', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Verify dropdown is open
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeVisible();
    
    // Click somewhere else on the page
    await page.click('body', { position: { x: 10, y: 10 } });
    
    // Dropdown should close
    await expect(searchInput).not.toBeVisible();
  });

  test('should navigate playlists with keyboard', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Wait for search input to be focused
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeFocused();
    
    // Press ArrowDown to highlight first playlist
    await searchInput.press('ArrowDown');
    
    // Press Enter to select
    await searchInput.press('Enter');
    
    // Dropdown should close and playlist should be selected
    await expect(searchInput).not.toBeVisible();
    
    // Button should show selected playlist (either Test Playlist 1 or Test Playlist 2)
    await expect(
      selectorButton.getByText(/Test Playlist/)
    ).toBeVisible();
  });

  test('should close dropdown when pressing Escape', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Verify dropdown is open
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeVisible();
    
    // Press Escape
    await searchInput.press('Escape');
    
    // Dropdown should close
    await expect(searchInput).not.toBeVisible();
  });

  test('should show check mark next to selected playlist', async ({ page }) => {
    // Open dropdown and select first playlist
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    const playlist1Button = page.locator('button:has-text("Test Playlist 1")').first();
    await expect(playlist1Button).toBeVisible({ timeout: 5000 });
    await playlist1Button.click();
    
    // Re-open dropdown
    await selectorButton.click();
    
    // Wait for dropdown to be visible again
    await expect(page.getByPlaceholder('Search playlists...')).toBeVisible();
    
    // The selected playlist should have a visible check mark
    // Check icon should be visible (opacity-100)
    const selectedPlaylistItem = page.locator('button:has-text("Test Playlist 1")').first();
    const checkIcon = selectedPlaylistItem.locator('svg').first();
    
    await expect(checkIcon).toBeVisible();
    await expect(checkIcon).toHaveCSS('opacity', '1');
  });

  test('should switch between playlists', async ({ page }) => {
    // Select first playlist
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    const playlist1Button = page.locator('button:has-text("Test Playlist 1")').first();
    await expect(playlist1Button).toBeVisible({ timeout: 5000 });
    await playlist1Button.click();
    
    // Verify first playlist is selected
    await expect(selectorButton).toContainText('Test Playlist 1');
    
    // Re-open and select second playlist
    await selectorButton.click();
    const playlist2Button = page.locator('button:has-text("Test Playlist 2")').first();
    await playlist2Button.click();
    
    // Verify second playlist is now selected
    await expect(selectorButton).toContainText('Test Playlist 2');
  });

  test('should load tracks when playlist is selected', async ({ page }) => {
    // Select a playlist
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    const playlist1Button = page.locator('button:has-text("Test Playlist 1")').first();
    await expect(playlist1Button).toBeVisible({ timeout: 5000 });
    await playlist1Button.click();
    
    // Wait for tracks to load
    // Mock data should have "Test Track 1", "Test Track 2", etc.
    await expect(page.locator('text=Test Track 1')).toBeVisible({ timeout: 5000 });
    
    // Verify table header is visible
    await expect(page.locator('text=TITLE')).toBeVisible();
    await expect(page.locator('text=ARTIST')).toBeVisible();
  });

  test('should show loading indicator when auto-loading playlists', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Search input should be visible immediately
    const searchInput = page.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeVisible();
    
    // Should show either loading text or loaded playlists
    // (Depends on whether playlists have loaded yet)
    const loadingOrPlaylists = page.locator('text=Loading...').or(
      page.locator('text=Test Playlist')
    );
    await expect(loadingOrPlaylists.first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle no playlists found when searching', async ({ page }) => {
    // Open dropdown
    const selectorButton = page.getByRole('combobox', { name: 'Select playlist' });
    await selectorButton.click();
    
    // Wait for playlists to load
    await expect(page.locator('text=Test Playlist 1')).toBeVisible({ timeout: 5000 });
    
    // Search for something that doesn't exist
    const searchInput = page.getByPlaceholder('Search playlists...');
    await searchInput.fill('NonExistentPlaylist12345');
    
    // Should show "No playlists found" message
    await expect(page.locator('text=No playlists found')).toBeVisible();
  });
});

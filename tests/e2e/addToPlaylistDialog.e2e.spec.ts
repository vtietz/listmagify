import { test, expect } from '@playwright/test';

async function openAddToPlaylistDialog(page: import('@playwright/test').Page) {
  await page.goto('/split-editor?layout=p.test-playlist-1');

  await expect(page.getByText('Test Track 1').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Test Track 2').first()).toBeVisible({ timeout: 20_000 });

  await page.getByText('Test Track 1').first().click();
  await page.getByText('Test Track 2').first().click({ modifiers: ['Shift'] });
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(2);

  await page.locator('[aria-selected="true"]').first().getByRole('button', { name: 'Add to playlist' }).click();

  const addDialog = page.getByRole('dialog', { name: 'Add to playlist' });
  await expect(addDialog).toBeVisible();
  return addDialog;
}

test.describe('Add to Playlist Dialog', () => {
  test('keeps backspace handling inside dialog search input', async ({ page }) => {
    const addDialog = await openAddToPlaylistDialog(page);

    const searchInput = addDialog.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeFocused();

    await searchInput.fill('abc');
    await searchInput.press('Backspace');

    await expect(searchInput).toHaveValue('ab');
    await expect(page.getByRole('alertdialog', { name: /Delete \d+ tracks\?/ })).not.toBeVisible();
    await expect(addDialog).toBeVisible();
  });

  test('closes add dialog on Escape without opening delete confirmation', async ({ page }) => {
    const addDialog = await openAddToPlaylistDialog(page);

    const searchInput = addDialog.getByPlaceholder('Search playlists...');
    await expect(searchInput).toBeFocused();

    await searchInput.press('Escape');

    await expect(addDialog).not.toBeVisible();
    await expect(page.getByRole('alertdialog', { name: /Delete \d+ tracks\?/ })).not.toBeVisible();
  });
});

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
});

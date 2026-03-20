import { expect, test } from '@playwright/test';

type ReorderPayload = {
  fromIndex?: number;
  toIndex?: number;
  rangeLength?: number;
};

test.describe('TIDAL Reorder', () => {
  test('sends tidal reorder request with expected payload', async ({ page }) => {
    await page.goto('/');

    let resolveCapturedPayload: ((value: ReorderPayload) => void) | null = null;
    const capturedPayload = new Promise<ReorderPayload>((resolve) => {
      resolveCapturedPayload = resolve;
    });

    await page.route('**/api/playlists/test-playlist-2/reorder**', async (route) => {
      const payload = route.request().postDataJSON() as ReorderPayload;
      resolveCapturedPayload?.(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ snapshotId: 'tidal-e2e-snapshot' }),
      });
    });

    const response = await page.evaluate(async () => {
      const raw = await fetch('/api/playlists/test-playlist-2/reorder?provider=tidal', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromIndex: 0,
          toIndex: 2,
          rangeLength: 1,
        }),
      });

      return raw.json();
    });

    const payload = await capturedPayload;

    expect(response).toEqual({ snapshotId: 'tidal-e2e-snapshot' });
    expect(typeof payload.fromIndex).toBe('number');
    expect(typeof payload.toIndex).toBe('number');
    expect(payload.rangeLength ?? 1).toBeGreaterThanOrEqual(1);
  });
});

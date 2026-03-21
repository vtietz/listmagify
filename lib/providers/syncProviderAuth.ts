import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import type { ProviderAuthSummary } from '@/lib/providers/types';

/**
 * Fetches the authoritative provider auth status from the server
 * and hydrates the client-side registry.
 *
 * Call this after any auth mutation (login, logout) to ensure
 * the client registry matches the server state.
 */
export async function syncProviderAuthStatus(): Promise<ProviderAuthSummary> {
  const response = await fetch('/api/provider-auth/status', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`auth_status_failed_${response.status}`);
  }

  const summary = await response.json() as ProviderAuthSummary;
  providerAuthRegistry.hydrateFromServer(summary);
  return summary;
}

/**
 * Syncs provider auth status, retrying once after a short delay on failure.
 * Useful after auth mutations where the server state may take a moment to settle.
 */
export async function syncProviderAuthStatusWithRetry(
  retryDelayMs = 500,
): Promise<ProviderAuthSummary | null> {
  try {
    return await syncProviderAuthStatus();
  } catch {
    // Retry once after a short delay — the server session may need a moment to update
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    try {
      return await syncProviderAuthStatus();
    } catch {
      providerAuthRegistry.markHydrated();
      return null;
    }
  }
}

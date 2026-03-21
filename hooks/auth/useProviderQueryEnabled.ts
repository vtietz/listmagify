'use client';

import { useProviderAuth } from '@/hooks/auth/useAuth';
import type { MusicProviderId } from '@/lib/music-provider/types';

/**
 * Returns whether queries for a given provider should be enabled.
 *
 * This is the single guard that all provider-dependent data hooks should use.
 * When the provider is not authenticated, queries are disabled — no API calls
 * are made, no error dialogs appear.
 */
export function useProviderQueryEnabled(providerId: MusicProviderId): boolean {
  const authState = useProviderAuth(providerId);
  return authState.code === 'ok';
}

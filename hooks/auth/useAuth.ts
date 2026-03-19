'use client';

import { useSyncExternalStore } from 'react';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import type { ProviderAuthState, ProviderAuthSummary, ProviderId } from '@/lib/providers/types';

function subscribe(listener: () => void): () => void {
  return providerAuthRegistry.onChange(listener);
}

function getSummarySnapshot(): ProviderAuthSummary {
  return providerAuthRegistry.getSummary();
}

export function useAuthSummary(): ProviderAuthSummary {
  return useSyncExternalStore(subscribe, getSummarySnapshot, getSummarySnapshot);
}

export function useProviderAuth(provider: ProviderId): ProviderAuthState {
  return useSyncExternalStore(
    subscribe,
    () => providerAuthRegistry.getState(provider),
    () => providerAuthRegistry.getState(provider),
  );
}

export function useAuthRegistryHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => providerAuthRegistry.hasHydratedFromServer(),
    () => providerAuthRegistry.hasHydratedFromServer(),
  );
}

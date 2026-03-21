'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { createDefaultProviderAuthSummary, type ProviderAuthSummary } from '@/lib/providers/types';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';

const STATUS_POLL_INTERVAL_MS = 30_000;

async function fetchProviderAuthStatus(): Promise<ProviderAuthSummary> {
  const response = await fetch('/api/provider-auth/status', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`auth_status_failed_${response.status}`);
  }

  return response.json() as Promise<ProviderAuthSummary>;
}

export function ProviderAuthBootstrap() {
  const { status } = useSession();
  const enabled = isPerPanelInlineLoginEnabled();
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncStatus = async () => {
      try {
        const summary = await fetchProviderAuthStatus();
        if (!cancelled) {
          providerAuthRegistry.hydrateFromServer(summary);
        }
      } catch {
        if (!cancelled) {
          providerAuthRegistry.markHydrated();
        }
      }
    };

    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' && !isE2EMode) {
      providerAuthRegistry.hydrateFromServer(createDefaultProviderAuthSummary());
      return;
    }

    void syncStatus();
    intervalId = setInterval(() => {
      void syncStatus();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [enabled, status, isE2EMode]);

  return null;
}

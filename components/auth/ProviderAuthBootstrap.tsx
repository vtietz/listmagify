'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { createDefaultProviderAuthSummary, type ProviderAuthSummary } from '@/lib/providers/types';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';

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

    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated' && !isE2EMode) {
      providerAuthRegistry.hydrateFromServer(createDefaultProviderAuthSummary());
      return;
    }

    fetchProviderAuthStatus()
      .then((summary) => {
        if (!cancelled) {
          providerAuthRegistry.hydrateFromServer(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          providerAuthRegistry.markHydrated();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, status, isE2EMode]);

  return null;
}

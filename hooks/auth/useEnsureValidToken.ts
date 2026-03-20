'use client';

import { useEffect, useMemo, useState } from 'react';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { type ProviderId, type ProviderAuthSummary } from '@/lib/providers/types';
import { useProviderAuth } from '@/hooks/auth/useAuth';

const MIN_REFRESH_INTERVAL_MS = 15_000;

const inflightByProvider = new Map<ProviderId, Promise<void>>();
const lastAttemptAtByProvider = new Map<ProviderId, number>();

async function fetchAuthStatus(): Promise<ProviderAuthSummary> {
  const response = await fetch('/api/provider-auth/status', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch auth status: ${response.status}`);
  }

  return response.json() as Promise<ProviderAuthSummary>;
}

function shouldAttemptRefresh(provider: ProviderId): boolean {
  const lastAttemptAt = lastAttemptAtByProvider.get(provider) ?? 0;
  return Date.now() - lastAttemptAt >= MIN_REFRESH_INTERVAL_MS;
}

async function refreshProviderStatus(provider: ProviderId): Promise<void> {
  if (!shouldAttemptRefresh(provider)) {
    return;
  }

  const existing = inflightByProvider.get(provider);
  if (existing) {
    await existing;
    return;
  }

  const operation = (async () => {
    lastAttemptAtByProvider.set(provider, Date.now());
    console.debug('[auth] token_refresh_attempted', { provider });

    try {
      const summary = await fetchAuthStatus();
      providerAuthRegistry.hydrateFromServer(summary);
      if (summary[provider].code === 'ok') {
        console.debug('[auth] token_refresh_succeeded', { provider });
      } else {
        console.debug('[auth] token_refresh_failed', {
          provider,
          code: summary[provider].code,
        });
      }
    } catch (error) {
      console.debug('[auth] provider token refresh check failed', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      console.debug('[auth] token_refresh_failed', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inflightByProvider.delete(provider);
    }
  })();

  inflightByProvider.set(provider, operation);
  await operation;
}

export interface UseEnsureValidTokenOptions {
  enabled?: boolean;
}

export function useEnsureValidToken(provider: ProviderId, opts: UseEnsureValidTokenOptions = {}) {
  const { enabled = true } = opts;
  const authState = useProviderAuth(provider);
  const [ensuring, setEnsuring] = useState(false);

  const shouldEnsure = useMemo(() => {
    if (!enabled) {
      return false;
    }

    if (!authState.canAttemptRefresh) {
      return false;
    }

    return authState.code === 'expired' || authState.code === 'invalid';
  }, [enabled, authState.canAttemptRefresh, authState.code]);

  useEffect(() => {
    if (!shouldEnsure) {
      return;
    }

    let cancelled = false;
    setEnsuring(true);

    refreshProviderStatus(provider)
      .finally(() => {
        if (!cancelled) {
          setEnsuring(false);
        }
      });

    return () => {
      cancelled = true;
      setEnsuring(false);
    };
  }, [provider, shouldEnsure]);

  return { ensuring };
}

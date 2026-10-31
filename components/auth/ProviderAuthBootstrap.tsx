'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { syncProviderAuthStatusWithRetry } from '@/lib/providers/syncProviderAuth';
import { createDefaultProviderAuthSummary } from '@/lib/providers/types';

const STATUS_POLL_INTERVAL_MS = 30_000;

/**
 * Keeps the client provider auth registry in sync with the server session.
 * Always runs: provider queries are gated on this registry, so skipping it
 * leaves every provider looking disconnected. The per-panel inline login
 * flag only controls the login UI, not this sync.
 */
export function ProviderAuthBootstrap() {
  const { status, update } = useSession();
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';
  const lastSessionUpdateRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncStatus = async () => {
      if (cancelled) {
        return;
      }

      const summary = await syncProviderAuthStatusWithRetry();
      if (!cancelled && !summary) {
        // Both attempts failed — mark hydrated so the UI isn't stuck in loading
        providerAuthRegistry.markHydrated();
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
  }, [status, isE2EMode]);

  // Re-sync when session is updated (e.g. after NextAuth `update()` call for logout)
  // The `update` function reference changes when the session is refreshed,
  // which signals that the server-side JWT has been modified.
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const now = Date.now();
    // Skip the initial mount — only react to subsequent session changes
    if (lastSessionUpdateRef.current === 0) {
      lastSessionUpdateRef.current = now;
      return;
    }

    // Debounce: skip if last sync was very recent (< 2s ago)
    if (now - lastSessionUpdateRef.current < 2_000) {
      return;
    }

    lastSessionUpdateRef.current = now;
    void syncProviderAuthStatusWithRetry();
  }, [status, update]);

  return null;
}

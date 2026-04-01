'use client';

import { useMemo } from 'react';
import { useProviderAuth } from '@features/auth/hooks/useAuth';
import type { ProviderId } from '@/lib/providers/types';

export interface UseEnsureValidTokenOptions {
  enabled?: boolean;
}

/**
 * Observes the auth state for a provider and reports whether the token is
 * in a bad state (expired/invalid).
 *
 * This hook is intentionally passive — it does NOT trigger server-side
 * token refresh. Refresh is handled by:
 * - The NextAuth JWT callback (on every API request via getServerSession)
 * - The token keepalive worker (proactive background refresh)
 * - ProviderAuthBootstrap polling (periodic status sync)
 *
 * Previously this hook called /api/provider-auth/status to trigger refresh,
 * which caused redundant refresh attempts and log spam when tokens were
 * permanently revoked.
 */
export function useEnsureValidToken(provider: ProviderId, opts: UseEnsureValidTokenOptions = {}) {
  const { enabled = true } = opts;
  const authState = useProviderAuth(provider);

  const ensuring = useMemo(() => {
    if (!enabled) return false;
    return authState.code === 'expired' || authState.code === 'invalid';
  }, [enabled, authState.code]);

  return { ensuring };
}

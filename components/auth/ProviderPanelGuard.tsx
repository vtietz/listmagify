'use client';

import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { OverlaySignInCTA } from '@/components/auth/OverlaySignInCTA';
import { useProviderAuth } from '@/hooks/auth/useAuth';
import { useEnsureValidToken } from '@/hooks/auth/useEnsureValidToken';
import type { ProviderId } from '@/lib/providers/types';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';

interface ProviderPanelGuardProps extends PropsWithChildren {
  provider: ProviderId;
  fillHeight?: boolean;
}

interface ProviderPanelGuardState {
  provider: ProviderId;
  isOverlayActive: boolean;
  reason: 'unauthenticated' | 'expired' | null;
}

const defaultGuardState: ProviderPanelGuardState = {
  provider: 'spotify',
  isOverlayActive: false,
  reason: null,
};

const ProviderPanelGuardContext = createContext<ProviderPanelGuardState>(defaultGuardState);

export function useProviderPanelGuardState(): ProviderPanelGuardState {
  return useContext(ProviderPanelGuardContext);
}

function shouldShowInlineLogin(code: string): boolean {
  return code === 'unauthenticated' || code === 'expired';
}

function getOverlayReason(code: string): 'unauthenticated' | 'expired' | null {
  if (code === 'expired' || code === 'unauthenticated') {
    return code;
  }

  return null;
}

export function ProviderPanelGuard({ provider, fillHeight = true, children }: ProviderPanelGuardProps) {
  const enabled = isPerPanelInlineLoginEnabled();

  const authState = useProviderAuth(provider);
  const { ensuring } = useEnsureValidToken(provider, {
    enabled: enabled && (authState.code === 'expired' || authState.code === 'invalid'),
  });

  const reason = getOverlayReason(authState.code);
  const isOverlayActive = enabled && !ensuring && shouldShowInlineLogin(authState.code) && reason !== null;

  const contextValue = useMemo<ProviderPanelGuardState>(
    () => ({
      provider,
      isOverlayActive,
      reason,
    }),
    [provider, isOverlayActive, reason],
  );

  if (!enabled) {
    return (
      <ProviderPanelGuardContext.Provider value={contextValue}>
        <>{children}</>
      </ProviderPanelGuardContext.Provider>
    );
  }

  return (
    <ProviderPanelGuardContext.Provider value={contextValue}>
      <div className={fillHeight ? 'relative h-full w-full' : 'relative w-full'}>
        <div className={fillHeight ? 'h-full w-full' : 'w-full'}>
          {children}
        </div>
        {isOverlayActive && reason && (
          <OverlaySignInCTA providerId={provider} reason={reason} />
        )}
      </div>
    </ProviderPanelGuardContext.Provider>
  );
}

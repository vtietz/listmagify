'use client';

import type { PropsWithChildren } from 'react';
import { InlineSignInCard } from '@/components/auth/InlineSignInCard';
import { useProviderAuth } from '@/hooks/auth/useAuth';
import { useEnsureValidToken } from '@/hooks/auth/useEnsureValidToken';
import type { ProviderId } from '@/lib/providers/types';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';

interface ProviderPanelGuardProps extends PropsWithChildren {
  provider: ProviderId;
}

function shouldShowInlineLogin(code: string): boolean {
  return code === 'unauthenticated' || code === 'expired';
}

export function ProviderPanelGuard({ provider, children }: ProviderPanelGuardProps) {
  const enabled = isPerPanelInlineLoginEnabled();

  const authState = useProviderAuth(provider);
  const { ensuring } = useEnsureValidToken(provider, {
    enabled: enabled && (authState.code === 'expired' || authState.code === 'invalid'),
  });

  if (!enabled) {
    return <>{children}</>;
  }

  if (ensuring) {
    return null;
  }

  if (shouldShowInlineLogin(authState.code)) {
    return <InlineSignInCard provider={provider} reason={authState.code} />;
  }

  return <>{children}</>;
}

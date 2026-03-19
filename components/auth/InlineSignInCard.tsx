'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SignInButton } from '@/components/auth/SignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProviderAuthCode, ProviderId } from '@/lib/providers/types';

interface InlineSignInCardProps {
  provider: ProviderId;
  reason: ProviderAuthCode;
  onSuccess?: () => void;
}

function getReasonCopy(reason: ProviderAuthCode, providerLabel: string): string {
  if (reason === 'expired') {
    return `Your ${providerLabel} session expired. Sign in again to continue.`;
  }

  if (reason === 'insufficient_scope') {
    return `Your ${providerLabel} permissions are incomplete. Sign in again to refresh access.`;
  }

  return `You need to sign in with ${providerLabel} to continue.`;
}

function buildCallbackUrl(pathname: string | null, queryString: string): string {
  const path = pathname && pathname.length > 0 ? pathname : '/split-editor';
  return queryString.length > 0 ? `${path}?${queryString}` : path;
}

export function InlineSignInCard({ provider, reason, onSuccess }: InlineSignInCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryString = searchParams?.toString() ?? '';
  const callbackUrl = useMemo(
    () => buildCallbackUrl(pathname, queryString),
    [pathname, queryString],
  );

  const providerLabel = provider === 'spotify' ? 'Spotify' : 'TIDAL';
  const description = getReasonCopy(reason, providerLabel);

  useEffect(() => {
    console.debug('[auth] inline_login_shown', { provider, reason });
  }, [provider, reason]);

  const handleClick = () => {
    console.debug('[auth] inline_login_clicked', { provider });
    onSuccess?.();
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{providerLabel} sign-in required</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButton
            providerId={provider}
            callbackUrl={callbackUrl}
            onClick={handleClick}
            className="w-full"
          />
        </CardContent>
      </Card>
    </div>
  );
}

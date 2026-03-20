'use client';

import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SignInButton } from '@/components/auth/SignInButton';
import { useAuthRegistryHydrated, useAuthSummary } from '@/hooks/auth/useAuth';
import { isPerPanelInlineLoginEnabled } from '@/lib/utils';
import type { ProviderId } from '@/lib/providers/types';

interface PublicConfigResponse {
  availableProviders?: ProviderId[];
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'spotify' || value === 'tidal';
}

function resolveProviderLabel(provider: ProviderId): string {
  return provider === 'spotify' ? 'Spotify' : 'TIDAL';
}

function resolveCallbackUrl(pathname: string | null, query: string): string {
  const path = pathname && pathname.length > 0 ? pathname : '/split-editor';
  return query.length > 0 ? `${path}?${query}` : path;
}

export function AnyAuthGuard({ children }: PropsWithChildren) {
  const enabled = isPerPanelInlineLoginEnabled();
  const summary = useAuthSummary();
  const hydrated = useAuthRegistryHydrated();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shouldBypassGlobalGuard = pathname === '/playlists';
  const [providers, setProviders] = useState<ProviderId[]>(['spotify']);

  const callbackUrl = useMemo(() => {
    const query = searchParams?.toString() ?? '';
    return resolveCallbackUrl(pathname, query);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!enabled || shouldBypassGlobalGuard) {
      return;
    }

    let cancelled = false;

    fetch('/api/config', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`config_failed_${response.status}`);
        }

        return response.json() as Promise<PublicConfigResponse>;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }

        const availableProviders = Array.isArray(data.availableProviders)
          ? data.availableProviders.filter(isProviderId)
          : [];

        if (availableProviders.length > 0) {
          setProviders(availableProviders);
        }
      })
      .catch(() => {
        // Keep default providers silently.
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, shouldBypassGlobalGuard]);

  if (!enabled) {
    return <>{children}</>;
  }

  if (shouldBypassGlobalGuard) {
    return <>{children}</>;
  }

  if (!hydrated) {
    return <>{children}</>;
  }

  if (summary.anyAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-xl text-center space-y-6">
        <h1 className="text-3xl font-semibold">Session expired</h1>
        <p className="text-muted-foreground text-lg">
          Your music provider session has expired. Sign in again to continue.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {providers.map((provider) => (
            <SignInButton
              key={provider}
              providerId={provider}
              callbackUrl={callbackUrl}
              label={`Sign in with ${resolveProviderLabel(provider)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

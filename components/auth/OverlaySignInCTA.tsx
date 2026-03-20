'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SignInButton } from '@/components/auth/SignInButton';
import type { ProviderId } from '@/lib/providers/types';

interface OverlaySignInCTAProps {
  providerId: ProviderId;
  reason: 'unauthenticated' | 'expired';
  onSignIn?: () => void;
}

function getProviderLabel(providerId: ProviderId): string {
  return providerId === 'spotify' ? 'Spotify' : 'TIDAL';
}

function getReasonText(reason: 'unauthenticated' | 'expired', providerLabel: string): string {
  if (reason === 'expired') {
    return `Your ${providerLabel} session expired.`;
  }

  return `Sign in with ${providerLabel} to continue in this panel.`;
}

function buildCallbackUrl(pathname: string | null, queryString: string): string {
  const path = pathname && pathname.length > 0 ? pathname : '/split-editor';
  return queryString.length > 0 ? `${path}?${queryString}` : path;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

export function OverlaySignInCTA({ providerId, reason, onSignIn }: OverlaySignInCTAProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const callbackUrl = useMemo(() => {
    const queryString = searchParams?.toString() ?? '';
    return buildCallbackUrl(pathname, queryString);
  }, [pathname, searchParams]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }

    const focusableElements = getFocusableElements(overlay);
    const firstFocusable = focusableElements[0];
    firstFocusable?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/75 p-4 backdrop-blur-[1px]"
      data-testid="panel-auth-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${getProviderLabel(providerId)} sign-in required`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') {
          return;
        }

        const overlay = overlayRef.current;
        if (!overlay) {
          return;
        }

        const focusableElements = getFocusableElements(overlay);
        if (focusableElements.length === 0) {
          return;
        }

        const firstFocusable = focusableElements[0]!;
        const lastFocusable = focusableElements[focusableElements.length - 1]!;
        const activeElement = document.activeElement;

        if (!event.shiftKey && activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }

        if (event.shiftKey && activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      }}
    >
      <div className="w-full max-w-xs rounded-md border bg-card p-4 shadow-sm">
        <p className="text-sm font-medium">{getProviderLabel(providerId)} sign-in required</p>
        <p className="mt-1 text-xs text-muted-foreground">{getReasonText(reason, getProviderLabel(providerId))}</p>
        <div className="mt-3">
          <SignInButton
            providerId={providerId}
            callbackUrl={callbackUrl}
            className="w-full"
            label={`Sign in with ${getProviderLabel(providerId)}`}
            {...(onSignIn ? { onClick: onSignIn } : {})}
          />
        </div>
      </div>
    </div>
  );
}
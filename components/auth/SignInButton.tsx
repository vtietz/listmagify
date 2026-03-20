"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useByokCredentials } from "@/hooks/useByokCredentials";
import type { MusicProviderId } from '@/lib/music-provider/types';

type Props = {
  label?: string;
  className?: string;
  callbackUrl?: string;
  providerId?: MusicProviderId;
  onClick?: () => void;
};

function withProviderInCallbackUrl(callbackUrl: string, providerId: MusicProviderId): string {
  try {
    if (callbackUrl.startsWith('/')) {
      const [rawPath, rawQuery] = callbackUrl.split('?');
      const path = rawPath ?? callbackUrl;
      const params = new URLSearchParams(rawQuery ?? '');
      params.set('provider', providerId);
      const serialized = params.toString();
      return serialized.length > 0 ? `${path}?${serialized}` : path;
    }

    const url = new URL(callbackUrl);
    url.searchParams.set('provider', providerId);
    return url.toString();
  } catch {
    return callbackUrl;
  }
}

export function SignInButton({ 
  label,
  className,
  callbackUrl = "/split-editor",
  providerId = 'spotify',
  onClick,
}: Props) {
  const { credentials, hasCredentials } = useByokCredentials();
  const [isLoading, setIsLoading] = useState(false);
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  const effectiveLabel = label
    ?? (providerId === 'spotify' ? 'Sign in with Spotify' : 'Sign in with TIDAL');

  const handleSignIn = async () => {
    onClick?.();
    const callbackUrlWithProvider = withProviderInCallbackUrl(callbackUrl, providerId);

    if (isE2EMode) {
      setIsLoading(true);
      try {
        await fetch(`/api/test/login?provider=${providerId}`, {
          method: 'GET',
          cache: 'no-store',
        });
      } finally {
        window.location.href = callbackUrlWithProvider;
      }
      return;
    }

    if (providerId !== 'spotify') {
      signIn(providerId, { callbackUrl: callbackUrlWithProvider });
      return;
    }

    // If BYOK credentials are available, use them
    if (hasCredentials && credentials) {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/byok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            callbackUrl: callbackUrlWithProvider,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to initiate authentication');
        }

        const { authUrl } = await response.json();
        window.location.href = authUrl;
      } catch (error) {
        console.error('[byok] Sign in error:', error);
        setIsLoading(false);
      }
    } else {
      // Use default provider from env
      signIn(providerId, { callbackUrl: callbackUrlWithProvider });
    }
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={isLoading}
      className={
        className ??
        "inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      }
      aria-label={effectiveLabel}
      type="button"
    >
      {isLoading ? "Signing in..." : effectiveLabel}
    </button>
  );
}
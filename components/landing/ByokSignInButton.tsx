'use client';

import { useState, useEffect } from 'react';
import { Key, Loader2 } from 'lucide-react';
import { ByokDialog } from '@/components/landing/ByokDialog';
import { useByokCredentials } from '@/hooks/useByokCredentials';

interface ByokSignInButtonProps {
  callbackUrl?: string;
}

/**
 * Button component for signing in with BYOK credentials.
 * Shows different states: not configured, configured, or loading.
 */
export function ByokSignInButton({ callbackUrl = '/playlists' }: ByokSignInButtonProps) {
  const { credentials, hasCredentials, isLoaded } = useByokCredentials();
  const [isLoading, setIsLoading] = useState(false);
  const [byokEnabled, setByokEnabled] = useState<boolean | null>(null);

  // Fetch BYOK enabled status from server
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setByokEnabled(data.byokEnabled ?? false))
      .catch(() => setByokEnabled(false));
  }, []);

  const handleByokSignIn = async () => {
    if (!credentials) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/byok', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          callbackUrl,
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
  };

  // Don't show if BYOK is disabled on the server
  if (byokEnabled === false) {
    return null;
  }
  
  // Show loading state while checking
  if (byokEnabled === null || !isLoaded) {
    return (
      <button
        disabled
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-sm font-medium opacity-50"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  if (hasCredentials) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleByokSignIn}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-6 py-3 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <Key className="h-4 w-4" />
              Sign in with Your API Key
            </>
          )}
        </button>
        <ByokDialog
          trigger={
            <button
              className="inline-flex items-center justify-center rounded-md border border-border bg-background p-3 text-sm font-medium hover:bg-accent transition-colors"
              title="Edit API credentials"
            >
              <Key className="h-4 w-4" />
            </button>
          }
        />
      </div>
    );
  }

  return (
    <ByokDialog
      trigger={
        <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
          Use Your Own API Key
        </button>
      }
    />
  );
}

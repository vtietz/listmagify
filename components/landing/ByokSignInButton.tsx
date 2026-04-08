'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { ByokDialog } from '@/components/landing/ByokDialog';
import { useByokCredentials } from '@features/auth/hooks/useByokCredentials';
import { getProviderDisplayName } from '@/lib/music-provider/providerLabels';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface ByokSignInButtonProps {
  providerId?: MusicProviderId;
}

/**
 * Button component for managing BYOK credentials.
 * Opens dialog to configure, edit, or delete API keys.
 */
export function ByokSignInButton({ providerId = 'spotify' }: ByokSignInButtonProps) {
  const { hasCredentials, isLoaded } = useByokCredentials(providerId);
  const [byokEnabled, setByokEnabled] = useState<boolean | null>(null);

  // Fetch BYOK enabled status from server
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: { byokEnabled?: boolean; tidalByokEnabled?: boolean }) => {
        const enabled = providerId === 'spotify'
          ? data.byokEnabled ?? false
          : data.tidalByokEnabled ?? false;
        setByokEnabled(enabled);
      })
      .catch(() => setByokEnabled(false));
  }, [providerId]);

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

  const providerLabel = getProviderDisplayName(providerId);

  return (
    <ByokDialog
      providerId={providerId}
      trigger={
        <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
          {hasCredentials && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
          Use Your Own {providerLabel} API Key
        </button>
      }
    />
  );
}

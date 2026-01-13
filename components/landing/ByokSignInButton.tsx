'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { ByokDialog } from '@/components/landing/ByokDialog';
import { useByokCredentials } from '@/hooks/useByokCredentials';

/**
 * Button component for managing BYOK credentials.
 * Opens dialog to configure, edit, or delete API keys.
 */
export function ByokSignInButton() {
  const { hasCredentials, isLoaded } = useByokCredentials();
  const [byokEnabled, setByokEnabled] = useState<boolean | null>(null);

  // Fetch BYOK enabled status from server
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setByokEnabled(data.byokEnabled ?? false))
      .catch(() => setByokEnabled(false));
  }, []);

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

  return (
    <ByokDialog
      trigger={
        <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
          {hasCredentials && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
          Use Your Own API Key
        </button>
      }
    />
  );
}

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface UnapprovedUserDialogProps {
  /**
  * OAuth error from provider (e.g., "access_denied")
   */
  error?: string | undefined;
  providerId?: MusicProviderId | undefined;
  /**
   * Whether access request feature is enabled
   */
  showRequestAccess?: boolean;
}

type OAuthErrorState = {
  shouldOpen: boolean;
  title: string;
  description: string;
  showDevModeHint: boolean;
};

function providerName(providerId: MusicProviderId | undefined): string {
  return providerId === 'tidal' ? 'TIDAL' : 'Spotify';
}

export function getOAuthErrorState(error?: string, providerId: MusicProviderId = 'spotify'): OAuthErrorState {
  const name = providerName(providerId);

  if (!error) {
    return {
      shouldOpen: false,
      title: 'Access Denied',
      description: `Your ${name} account may not be in the approved users list for this app.`,
      showDevModeHint: providerId === 'spotify',
    };
  }

  if (error === 'access_denied' || error === 'AccessDenied') {
    return {
      shouldOpen: true,
      title: 'Access Denied',
      description: `Your ${name} account may not be in the approved users list for this app.`,
      showDevModeHint: providerId === 'spotify',
    };
  }

  if (error === 'Configuration') {
    return {
      shouldOpen: true,
      title: 'Configuration Error',
      description: `There is a configuration issue with ${name} OAuth. Please contact the administrator.`,
      showDevModeHint: false,
    };
  }

  if (error === 'OAuthCallback') {
    return {
      shouldOpen: true,
      title: 'Sign-In Failed',
      description: `${name} sign-in could not be completed. Please try again.`,
      showDevModeHint: false,
    };
  }

  return {
    shouldOpen: false,
    title: 'Access Denied',
    description: `Your ${name} account may not be in the approved users list for this app.`,
    showDevModeHint: providerId === 'spotify',
  };
}

/**
 * Dialog shown when a user tries to log in but is not in the approved users list.
 * This happens when the app is in Spotify development mode.
 */
export function UnapprovedUserDialog({
  error,
  providerId = 'spotify',
  showRequestAccess: _showRequestAccess = false,
}: UnapprovedUserDialogProps) {
  const [open, setOpen] = useState(false);
  const errorState = getOAuthErrorState(error, providerId);

  // Show dialog when there's an OAuth error
  // NextAuth error codes: OAuthCallback, Configuration, AccessDenied
  // Spotify returns: access_denied
  useEffect(() => {
    if (errorState.shouldOpen) {
      setOpen(true);
    }
  }, [errorState.shouldOpen]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {errorState.title}
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              {errorState.description}
              {errorState.showDevModeHint && (
                <>
                  <br />
                  This app is currently in Spotify{' '}
                  <a
                    href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    development mode
                  </a>
                  , which limits access to a specific list of approved users.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

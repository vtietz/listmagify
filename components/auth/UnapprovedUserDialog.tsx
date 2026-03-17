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

interface UnapprovedUserDialogProps {
  /**
   * OAuth error from Spotify (e.g., "access_denied")
   */
  error?: string | undefined;
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

export function getOAuthErrorState(error?: string): OAuthErrorState {
  if (!error) {
    return {
      shouldOpen: false,
      title: 'Access Denied',
      description: 'Your Spotify account may not be in the approved users list for this app.',
      showDevModeHint: true,
    };
  }

  if (error === 'access_denied' || error === 'AccessDenied') {
    return {
      shouldOpen: true,
      title: 'Access Denied',
      description: 'Your Spotify account may not be in the approved users list for this app.',
      showDevModeHint: true,
    };
  }

  if (error === 'Configuration') {
    return {
      shouldOpen: true,
      title: 'Configuration Error',
      description: 'There is a configuration issue with the Spotify OAuth. Please contact the administrator.',
      showDevModeHint: false,
    };
  }

  if (error === 'OAuthCallback') {
    return {
      shouldOpen: true,
      title: 'Sign-In Failed',
      description: 'Spotify sign-in could not be completed. Please try again.',
      showDevModeHint: false,
    };
  }

  return {
    shouldOpen: false,
    title: 'Access Denied',
    description: 'Your Spotify account may not be in the approved users list for this app.',
    showDevModeHint: true,
  };
}

/**
 * Dialog shown when a user tries to log in but is not in the approved users list.
 * This happens when the app is in Spotify development mode.
 */
export function UnapprovedUserDialog({ error, showRequestAccess: _showRequestAccess = false }: UnapprovedUserDialogProps) {
  const [open, setOpen] = useState(false);
  const errorState = getOAuthErrorState(error);

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

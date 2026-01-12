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

/**
 * Dialog shown when a user tries to log in but is not in the approved users list.
 * This happens when the app is in Spotify development mode.
 */
export function UnapprovedUserDialog({ error, showRequestAccess: _showRequestAccess = false }: UnapprovedUserDialogProps) {
  const [open, setOpen] = useState(false);

  // Show dialog when there's an OAuth error
  // NextAuth error codes: OAuthCallback, Configuration, AccessDenied
  // Spotify returns: access_denied
  useEffect(() => {
    if (error && (
      error === 'access_denied' || 
      error === 'AccessDenied' || 
      error === 'OAuthCallback' ||
      error === 'Configuration'
    )) {
      setOpen(true);
    }
  }, [error]);

  // Determine error message based on error type
  const errorTitle = error === 'Configuration' ? 'Configuration Error' : 'Access Denied';
  const errorDescription = error === 'Configuration' 
    ? 'There is a configuration issue with the Spotify OAuth. Please contact the administrator.'
    : 'Your Spotify account may not be in the approved users list for this app.';

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {errorTitle}
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                {errorDescription}
              </p>
              {error !== 'Configuration' && (
                <p>
                  This app is currently in Spotify development mode, which limits access to a specific list of approved users.
                </p>
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

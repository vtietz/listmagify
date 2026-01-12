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
import { AccessRequestDialog } from '@/components/landing/AccessRequestDialog';

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
export function UnapprovedUserDialog({ error, showRequestAccess = false }: UnapprovedUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [showAccessRequestDialog, setShowAccessRequestDialog] = useState(false);

  // Show dialog when there's an access_denied error
  // NextAuth uses 'AccessDenied' (PascalCase), Spotify returns 'access_denied'
  useEffect(() => {
    if (error === 'access_denied' || error === 'AccessDenied') {
      setOpen(true);
    }
  }, [error]);

  const handleRequestAccess = () => {
    setOpen(false);
    setTimeout(() => {
      setShowAccessRequestDialog(true);
    }, 200);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              User Not Approved
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                Your Spotify account is not in the approved users list for this app.
              </p>
              <p>
                This app is currently in Spotify development mode, which limits access to a specific list of approved users.
              </p>
              {showRequestAccess && (
                <p className="font-medium text-foreground">
                  You can request access, and the app administrator will add you to the approved list.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
            {showRequestAccess && (
              <Button onClick={handleRequestAccess} className="w-full sm:w-auto">
                Request Access
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAccessRequestDialog && (
        <AccessRequestDialog
          trigger={null}
          defaultOpen={true}
        />
      )}
    </>
  );
}

/**
 * ErrorPanel - Renders appropriate error states for playlist loading failures.
 *
 * Handles different error types:
 * - AccessTokenExpiredError / unauthorized: prompts sign-in
 * - Not found: displays "playlist not found" message
 * - Generic errors: displays error message
 */

'use client';

import { AlertCircle } from 'lucide-react';
import { ApiError, AccessTokenExpiredError } from '@/lib/api/client';
import { SignInButton } from '@/components/auth/SignInButton';
import type { PlaylistPanelError } from './types';

interface ErrorPanelProps {
  /** The error to display */
  error: PlaylistPanelError;
  /** Callback URL for sign-in redirect (defaults to /split-editor) */
  signInCallbackUrl?: string;
}

export function ErrorPanel({
  error,
  signInCallbackUrl = '/split-editor',
}: ErrorPanelProps) {
  const isSessionExpired =
    error instanceof AccessTokenExpiredError ||
    (error instanceof ApiError && (error.isUnauthorized || error.isForbidden));

  const isNotFound = error instanceof ApiError && error.isNotFound;

  return (
    <div className="p-4 flex flex-col items-center justify-center text-center gap-3">
      <AlertCircle className="h-8 w-8 text-red-500" />

      {isSessionExpired ? (
        <>
          <p className="text-red-500 font-medium">Session expired</p>
          <p className="text-sm text-muted-foreground">
            Please sign in again to access your playlists.
          </p>
          <SignInButton
            callbackUrl={signInCallbackUrl}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          />
        </>
      ) : isNotFound ? (
        <>
          <p className="text-red-500 font-medium">Playlist not found</p>
          <p className="text-sm text-muted-foreground">
            This playlist may have been deleted or you don&apos;t have access to it.
          </p>
        </>
      ) : (
        <p className="text-red-500">
          Failed to load playlist:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}
    </div>
  );
}

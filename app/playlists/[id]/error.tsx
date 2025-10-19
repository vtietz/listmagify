"use client";

import { useEffect } from "react";
import { SignInButton } from "@/components/auth/SignInButton";
import { useRouter } from "next/navigation";

/**
 * Error boundary for /playlists/[id] route.
 * Catches token expiration errors and shows sign-in UI.
 * Prevents page crashes when server-side data fetching fails due to auth issues.
 */
export default function PlaylistDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log error for debugging
    console.error("[playlists/[id]/error]", error);
  }, [error]);

  // Check if this is a token expiration error
  const isAuthError =
    error.message.includes("401") ||
    error.message.includes("Unauthorized") ||
    error.message.includes("access token expired") ||
    error.message.includes("RefreshAccessTokenError");

  if (isAuthError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-semibold">Session Expired</h2>
          <p className="text-muted-foreground">
            Your Spotify session has expired. Please sign in again to continue.
          </p>
          <div className="flex justify-center gap-3">
            <SignInButton callbackUrl="/playlists" />
          </div>
        </div>
      </div>
    );
  }

  // Generic error fallback
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground">
          {error.message || "An unexpected error occurred while loading this playlist."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/playlists")}
            className="text-muted-foreground hover:underline"
          >
            Back to playlists
          </button>
        </div>
      </div>
    </div>
  );
}

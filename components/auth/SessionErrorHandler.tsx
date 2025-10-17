"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";

/**
 * Client component that monitors session for token refresh errors.
 * If a RefreshAccessTokenError occurs (e.g., revoked refresh token),
 * automatically sign out the user to force re-authentication.
 * 
 * Mount this once in the root layout to apply globally.
 */
export function SessionErrorHandler() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session && (session as any).error === "RefreshAccessTokenError") {
      console.warn("[auth] Refresh token invalid or expired, signing out...");
      void signOut({ callbackUrl: "/login" });
    }
  }, [session]);

  return null;
}

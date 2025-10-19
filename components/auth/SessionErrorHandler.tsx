"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

/**
 * Client component that monitors session for token refresh errors.
 * If a RefreshAccessTokenError occurs (e.g., revoked refresh token),
 * automatically sign out the user to force re-authentication.
 * 
 * Does NOT trigger navigation - relies on middleware to handle redirects.
 * Rate-limits sign-out attempts to prevent hammering the auth endpoint.
 * 
 * Mount this once in the root layout to apply globally.
 */
export function SessionErrorHandler() {
  const { data: session, status } = useSession();
  const [lastSignOutAttempt, setLastSignOutAttempt] = useState<number>(0);

  useEffect(() => {
    // Only handle RefreshAccessTokenError
    if (status === "authenticated" && session && (session as any).error === "RefreshAccessTokenError") {
      const now = Date.now();
      const timeSinceLastAttempt = now - lastSignOutAttempt;
      
      // Rate-limit: only sign out once every 5 seconds
      if (timeSinceLastAttempt > 5000) {
        console.warn("[auth] Refresh token invalid or expired, signing out...");
        setLastSignOutAttempt(now);
        
        // Sign out without redirect - middleware will handle routing
        void signOut({ redirect: false });
      }
    }
  }, [session, status, lastSignOutAttempt]);

  return null;
}

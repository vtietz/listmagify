"use client";

import { useSession } from "next-auth/react";

/**
 * Typed helper hook to access the current session user from NextAuth.
 * Keeps components lean and avoids repeating status checks.
 */
export type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string;
};

export function useSessionUser() {
  const { data, status } = useSession();
  const user = data?.user as SessionUser | undefined;

  // Check for session error (e.g., RefreshAccessTokenError)
  const error = (data as { error?: string } | null)?.error;
  const hasSessionError = error === "RefreshAccessTokenError";

  return {
    user,
    session: data,
    status, // "authenticated" | "unauthenticated" | "loading"
    // User is only authenticated if status says so AND there's no session error
    authenticated: status === "authenticated" && !hasSessionError,
    loading: status === "loading",
    error,
    hasSessionError,
  };
}
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

  return {
    user,
    session: data,
    status, // "authenticated" | "unauthenticated" | "loading"
    authenticated: status === "authenticated",
    loading: status === "loading",
  };
}
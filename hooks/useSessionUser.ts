"use client";

import { useSession } from "next-auth/react";
import type { Session } from "next-auth";

/**
 * Typed helper hook to access the current session user from NextAuth.
 * Keeps components lean and avoids repeating status checks.
 */
export type SessionUser = NonNullable<Session["user"]> & {
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
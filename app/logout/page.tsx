"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function LogoutPage() {
  useEffect(() => {
    void signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center space-y-2">
        <p className="text-lg font-medium">Signing out…</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Redirecting to login.
        </p>
      </div>
    </div>
  );
}
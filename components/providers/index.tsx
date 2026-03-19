"use client";

import { SessionProvider } from "next-auth/react";
import { QueryProvider } from "./QueryProvider";
import { GlobalErrorHandler } from "@/components/errors";
import { ProviderAuthBootstrap } from "@/components/auth/ProviderAuthBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // refetchInterval: Check session every 5 minutes to keep tokens fresh
    // refetchOnWindowFocus: Refresh session when user returns to the tab
    // This ensures tokens are refreshed proactively before expiry
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <QueryProvider>
        <ProviderAuthBootstrap />
        {children}
        <GlobalErrorHandler />
      </QueryProvider>
    </SessionProvider>
  );
}
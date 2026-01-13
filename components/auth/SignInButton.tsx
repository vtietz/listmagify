"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useByokCredentials } from "@/hooks/useByokCredentials";

type Props = {
  label?: string;
  className?: string;
  callbackUrl?: string;
};

export function SignInButton({ 
  label = "Sign in with Spotify", 
  className,
  callbackUrl = "/split-editor"
}: Props) {
  const { credentials, hasCredentials } = useByokCredentials();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    // If BYOK credentials are available, use them
    if (hasCredentials && credentials) {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/byok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            callbackUrl,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to initiate authentication');
        }

        const { authUrl } = await response.json();
        window.location.href = authUrl;
      } catch (error) {
        console.error('[byok] Sign in error:', error);
        setIsLoading(false);
      }
    } else {
      // Use default provider from env
      signIn("spotify", { callbackUrl });
    }
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={isLoading}
      className={
        className ??
        "inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      }
      aria-label={label}
      type="button"
    >
      {isLoading ? "Signing in..." : label}
    </button>
  );
}
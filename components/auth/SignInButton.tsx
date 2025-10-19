"use client";

import { signIn } from "next-auth/react";

type Props = {
  label?: string;
  className?: string;
  callbackUrl?: string;
};

export function SignInButton({ 
  label = "Sign in with Spotify", 
  className,
  callbackUrl = "/playlists"
}: Props) {
  return (
    <button
      onClick={() => signIn("spotify", { callbackUrl })}
      className={
        className ??
        "inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors"
      }
      aria-label={label}
      type="button"
    >
      {label}
    </button>
  );
}
"use client";

import Link from "next/link";

/**
 * Application footer with Spotify attribution and legal links.
 * Shows Spotify logo and attribution on the left, legal links on the right.
 * Use on all pages displaying Spotify content.
 */
export function AppFooter() {
  return (
    <div className="flex items-center justify-between gap-4 text-muted-foreground">
      {/* Spotify Attribution - Left side */}
      <div className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/spotify/Primary_Logo_White_RGB.svg"
          alt="Spotify"
          className="h-4 hidden dark:block"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/spotify/Primary_Logo_Black_RGB.svg"
          alt="Spotify"
          className="h-4 dark:hidden"
        />
        <span className="text-[10px]">
          Content provided by{" "}
          <Link
            href="https://www.spotify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Spotify
          </Link>
        </span>
      </div>

      {/* Legal Links - Right side */}
      <div className="flex gap-4 text-[10px]">
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          Privacy
        </Link>
        <Link
          href="/imprint"
          className="hover:text-foreground transition-colors"
        >
          Imprint
        </Link>
      </div>
    </div>
  );
}

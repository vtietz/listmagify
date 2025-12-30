"use client";

import Link from "next/link";

/**
 * Spotify attribution footer - Required per Spotify Design Guidelines.
 * Shows Spotify logo and "Content provided by Spotify" text.
 * Use on pages displaying Spotify content (playlists, tracks, etc.)
 */
export function SpotifyAttribution() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
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
      <span className="text-[10px]">Content provided by <Link href="https://www.spotify.com" target="_blank" rel="noopener noreferrer">Spotify</Link></span>
    </div>
  );
}

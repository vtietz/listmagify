"use client";

import Link from "next/link";

/**
 * Spotify attribution footer - Required per Spotify Design Guidelines.
 * Shows Spotify logo and "Content provided by Spotify" text.
 * Use on pages displaying Spotify content (playlists, tracks, etc.)
 */
export function SpotifyAttribution() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {/* Per Spotify guidelines: full logo min 70px width. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/spotify/Primary_Logo_White_RGB.svg"
        alt="Spotify"
        className="h-5 hidden dark:block"
        style={{ minWidth: '70px' }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/spotify/Primary_Logo_Black_RGB.svg"
        alt="Spotify"
        className="h-5 dark:hidden"
        style={{ minWidth: '70px' }}
      />
      <span className="text-[10px]">Content provided by <Link href="https://www.spotify.com" target="_blank" rel="noopener noreferrer">Spotify</Link></span>
    </div>
  );
}

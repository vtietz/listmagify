"use client";

import Image from "next/image";
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
      {/* SVG logos from public folder - unoptimized since SVG doesn't benefit from raster optimization */}
      <Image
        src="/spotify/Primary_Logo_White_RGB.svg"
        alt="Spotify"
        width={70}
        height={21}
        className="hidden dark:block"
        unoptimized
      />
      <Image
        src="/spotify/Primary_Logo_Black_RGB.svg"
        alt="Spotify"
        width={70}
        height={21}
        className="dark:hidden"
        unoptimized
      />
      <span className="text-[10px]">Content provided by <Link href="https://www.spotify.com" target="_blank" rel="noopener noreferrer">Spotify</Link></span>
    </div>
  );
}

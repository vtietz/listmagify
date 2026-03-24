"use client";

import Image from "next/image";
import Link from "next/link";
// Github brand icon is deprecated in lucide-react but still functional
// TODO: Consider migrating to SimpleIcons in the future
import { Github, MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback";

/**
 * Application footer with compact provider attribution and legal links.
 * Shows provider logo on the left, legal links on the right.
 */
export function AppFooter({ showSpotifyAttribution = true }: { showSpotifyAttribution?: boolean }) {
  return (
    <div className={`flex items-center gap-4 text-muted-foreground ${showSpotifyAttribution ? 'justify-between' : 'justify-end'}`}>
      {showSpotifyAttribution ? (
        <div className="flex items-center">
          <Image
            src="/spotify/Spotify_Primary_Logo_RGB_White.png"
            alt="Spotify"
            width={56}
            height={17}
            className="hidden dark:block"
            unoptimized
          />
          <Image
            src="/spotify/Spotify_Primary_Logo_RGB_Black.png"
            alt="Spotify"
            width={56}
            height={17}
            className="dark:hidden"
            unoptimized
          />
        </div>
      ) : (
        <div className="h-5" />
      )}

      {/* Links - Right side */}
      <div className="flex gap-4 text-[10px]">
        <FeedbackDialog
          trigger={
            <button
              className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer"
              suppressHydrationWarning
            >
              <MessageSquarePlus className="h-3 w-3" />
              Feedback
            </button>
          }
        />
        <Link
          href="https://github.com/vtietz/listmagify"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Github className="h-3 w-3" />
          GitHub
        </Link>
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

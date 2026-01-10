"use client";

import Link from "next/link";
// Github brand icon is deprecated in lucide-react but still functional
// TODO: Consider migrating to SimpleIcons in the future
import { Github, MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback";

/**
 * Application footer with Spotify attribution and legal links.
 * Shows Spotify logo and attribution on the left, legal links on the right.
 * Use on all pages displaying Spotify content.
 */
export function AppFooter() {
  return (
    <div className="flex items-center justify-between gap-4 text-muted-foreground">
      {/* Spotify Attribution - Left side */}
      {/* Per Spotify guidelines: full logo min 70px width, icon min 21px. Using logo. */}
      <div className="flex items-center gap-2">
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

      {/* Links - Right side */}
      <div className="flex gap-4 text-[10px]">
        <FeedbackDialog
          trigger={
            <button className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer">
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

"use client";

import Link from "next/link";
// Github brand icon is deprecated in lucide-react but still functional
// TODO: Consider migrating to SimpleIcons in the future
import { Github, MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback";

/**
 * Application footer with legal links.
 */
export function AppFooter({ showSpotifyAttribution: _showSpotifyAttribution = true }: { showSpotifyAttribution?: boolean }) {
  return (
    <div className="flex items-center justify-end text-muted-foreground">
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

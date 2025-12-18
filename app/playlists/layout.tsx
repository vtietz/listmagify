"use client";

import { useBrowsePanelStore } from "@/hooks/useBrowsePanelStore";
import { BrowsePanel } from "@/components/split/BrowsePanel";

export default function PlaylistsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isBrowsePanelOpen = useBrowsePanelStore((state) => state.isOpen);

  return (
    <div className="h-full w-full flex">
      {/* Main content area */}
      <div className="flex-1 min-w-0 overflow-auto">
        {children}
      </div>
      
      {/* Browse panel (Spotify search) */}
      {isBrowsePanelOpen && (
        <BrowsePanel />
      )}
    </div>
  );
}

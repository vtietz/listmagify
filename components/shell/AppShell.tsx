"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useBrowsePanelStore } from "@/hooks/useBrowsePanelStore";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { useCompareModeStore } from "@/hooks/useCompareModeStore";
import { useInsertionPointsStore } from "@/hooks/useInsertionPointsStore";
import { useSessionUser } from "@/hooks/useSessionUser";
import { useStatsAccess } from "@/hooks/useStatsAccess";
import { useDeviceType } from "@/hooks/useDeviceType";
import { SpotifyPlayer } from "@/components/player";
import { BrowsePanel } from "@/components/split-editor/BrowsePanel";
import { AppLogo } from "@/components/ui/app-logo";
import { AppFooter } from "@/components/ui/app-footer";
import { cn } from "@/lib/utils";
import {
  AdaptiveNav,
  LoginButton,
  type MarkerStats,
} from "./HeaderComponents";

type AppShellProps = {
  headerTitle?: string;
  children?: React.ReactNode;
};

/**
 * AppShell - Unified layout component for the entire app.
 * 
 * Layout types:
 * - Fixed height (split-editor, playlist detail): Header + Content (fills viewport, internal scrolling) + Footer + Player
 * - Scrollable (everything else): Header + Content (scrolls with page) + Footer + Player
 * 
 * The landing page (/) is handled specially - it provides its own content structure
 * but still uses AppShell's header for consistency.
 */
export function AppShell({ headerTitle = "Listmagify", children }: AppShellProps) {
  const pathname = usePathname();
  const isBrowsePanelOpen = useBrowsePanelStore((state) => state.isOpen);
  const { authenticated } = useSessionUser();
  const { isPhone } = useDeviceType();

  const isLandingPage = pathname === "/";
  
  // Pages that handle their own complete layout (bypass AppShell)
  const isStandalonePage = pathname === '/login' || (isLandingPage && !authenticated);
  
  // Content pages that don't need player or browse panel (static/legal pages)
  const isContentPage = pathname === '/privacy' || 
                        pathname === '/imprint' ||
                        pathname === '/logout';
  
  // Pages that need fixed viewport height (no global scrolling, internal scroll containers)
  // - Split editor: multiple panels with their own scroll
  // - Playlist detail: uses SplitGrid which needs internal scrolling
  const isFixedHeightPage = pathname === '/split-editor' || 
                            pathname.startsWith('/playlists/');
  
  // Standalone pages - render children directly (pages handle their own layout)
  if (isStandalonePage) {
    return <>{children}</>;
  }

  // Landing page when authenticated: keep content as-is, but show the normal header/nav.
  // Avoid player/browse panel here to match the public landing layout.
  if (isLandingPage && authenticated) {
    return (
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <Header title={headerTitle} />
        <main className="flex-1 overflow-auto">{children}</main>
        <div className="flex-shrink-0 px-4 py-2 border-t border-border">
          <AppFooter />
        </div>
      </div>
    );
  }

  // Content pages - simple scrollable layout without player or browse panel
  if (isContentPage) {
    return (
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <Header title={headerTitle} />
        <main className="flex-1 overflow-auto">{children}</main>
        {!isPhone && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border">
            <AppFooter />
          </div>
        )}
      </div>
    );
  }

  // Fixed height layout for split editor and playlist detail (internal scrolling)
  if (isFixedHeightPage) {
    // Split editor renders its own player inside DndContext for drag-and-drop support
    const isSplitEditor = pathname === '/split-editor';
    
    return (
      <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
        <Header title={headerTitle} />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        {/* On phone, SplitGrid handles player via bottom nav toggle */}
        {/* Split editor renders player inside its DndContext for drag support */}
        {!isPhone && !isSplitEditor && <SpotifyPlayer />}
        {!isPhone && (
          <div className="flex-shrink-0 px-4 py-1 border-t border-border">
            <AppFooter />
          </div>
        )}
      </div>
    );
  }

  // Standard scrollable layout (browser native scrolling with sticky header/footer)
  // Used by playlists index page (/playlists) and other non-fixed pages
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-shrink-0 bg-background">
        <Header title={headerTitle} />
      </div>
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        {authenticated && isBrowsePanelOpen && (
          <div className={cn(
            isPhone 
              ? "absolute inset-0 z-50 bg-background" // Mobile: full-screen overlay
              : "relative" // Desktop: side panel
          )}>
            <BrowsePanel isMobileOverlay={isPhone} />
          </div>
        )}
      </div>
      {/* On phone, player is handled by split-editor's bottom nav */}
      {!isPhone && (
        <div className="flex-shrink-0 bg-background">
          <SpotifyPlayer />
          <div className="px-4 py-2 border-t border-border">
            <AppFooter />
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ title: _title }: { title: string }) {
  const pathname = usePathname();
  const { isCompact, toggle: toggleCompact } = useCompactModeStore();
  const { isEnabled: isCompareEnabled, toggle: toggleCompare } = useCompareModeStore();
  const { isOpen: isBrowseOpen, toggle: toggleBrowse } = useBrowsePanelStore();
  const { isPlayerVisible, togglePlayerVisible } = usePlayerStore();
  const clearAllMarkers = useInsertionPointsStore((s) => s.clearAll);
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const { authenticated, loading } = useSessionUser();
  const { hasAccess: hasStatsAccess } = useStatsAccess();
  const { isPhone } = useDeviceType();
  
  // Compute marker stats from playlists state using memoized selector
  const markerStats: MarkerStats = React.useMemo(() => {
    const playlistIds = Object.keys(playlists).filter(
      (id) => (playlists[id]?.markers.length ?? 0) > 0
    );
    const totalMarkers = playlistIds.reduce(
      (sum, id) => sum + (playlists[id]?.markers.length ?? 0),
      0
    );
    return { playlistIds, playlistCount: playlistIds.length, totalMarkers };
  }, [playlists]);
  
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  const isLandingPage = pathname === '/';
  
  // Pages that support player and compare mode
  const supportsPlayerAndCompare = isSplitEditorActive || isPlaylistsActive;
  
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <AppLogo size="sm" />

      <nav className="flex flex-1 items-center justify-end gap-1 text-sm min-w-0">
        {/* Only show nav items when authenticated */}
        {authenticated && (
          <AdaptiveNav
            isPhone={isPhone}
            pathname={pathname}
            hasStatsAccess={hasStatsAccess}
            isBrowseOpen={isBrowseOpen}
            toggleBrowse={toggleBrowse}
            supportsBrowse={!isLandingPage}
            isPlayerVisible={isPlayerVisible}
            togglePlayerVisible={togglePlayerVisible}
            supportsPlayer={supportsPlayerAndCompare}
            supportsCompact={!isLandingPage}
            isCompact={isCompact}
            toggleCompact={toggleCompact}
            isCompareEnabled={isCompareEnabled}
            toggleCompare={toggleCompare}
            supportsCompare={supportsPlayerAndCompare}
            markerStats={markerStats}
            clearAllMarkers={clearAllMarkers}
          />
        )}
        
        {/* Show Login button when not authenticated */}
        {!loading && !authenticated && <LoginButton />}
      </nav>
    </header>
  );
}
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ListMusic, LogIn, LogOut, Minimize2, MapPinOff, BarChart3, GitCompare, Menu, Shield, FileText, Columns } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/ui/app-logo";
import { AppFooter } from "@/components/ui/app-footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import Link from "next/link";

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
  
  // Landing page doesn't use AppShell wrapper (has its own layout)
  const isLandingPage = pathname === '/';
  
  // Content pages that don't need player or browse panel (static/legal pages)
  const isContentPage = pathname === '/privacy' || 
                        pathname === '/imprint' ||
                        pathname === '/login' ||
                        pathname === '/logout';
  
  // Pages that need fixed viewport height (no global scrolling, internal scroll containers)
  // - Split editor: multiple panels with their own scroll
  // - Playlist detail: uses SplitGrid which needs internal scrolling
  const isFixedHeightPage = pathname === '/split-editor' || 
                            pathname.startsWith('/playlists/');
  
  // Landing page - render children directly (page handles its own layout)
  if (isLandingPage) {
    return <>{children}</>;
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
    return (
      <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
        <Header title={headerTitle} />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <SpotifyPlayer />
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
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        {authenticated && isBrowsePanelOpen && !isPhone && <BrowsePanel />}
      </div>
      <div className="flex-shrink-0 bg-background">
        <SpotifyPlayer />
        {!isPhone && (
          <div className="px-4 py-2 border-t border-border">
            <AppFooter />
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  const pathname = usePathname();
  const { isCompact, toggle: toggleCompact } = useCompactModeStore();
  const { isEnabled: isCompareEnabled, toggle: toggleCompare } = useCompareModeStore();
  const clearAllMarkers = useInsertionPointsStore((s) => s.clearAll);
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const { authenticated, loading } = useSessionUser();
  const { hasAccess: hasStatsAccess } = useStatsAccess();
  
  // Compute marker stats from playlists state
  const markerStats = React.useMemo(() => {
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
  const isStatsActive = pathname === '/stats' || pathname.startsWith('/stats/');
  
  // Pages that support compare mode
  const supportsCompare = isSplitEditorActive || isPlaylistsActive;
  
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <AppLogo size="sm" />

      <nav className="flex items-center gap-1 text-sm">
        {/* Only show nav items when authenticated */}
        {authenticated && (
          <>
            {/* Desktop navigation - visible on md and larger screens */}
            <div className="hidden md:flex items-center gap-1">
              <Button
                variant={isPlaylistsActive ? "secondary" : "ghost"}
                size="sm"
                asChild
                className="h-7 gap-1.5 cursor-pointer"
              >
                <Link href="/playlists">
                  <ListMusic className="h-3.5 w-3.5" />
                  Playlists
                </Link>
              </Button>
              <Button
                variant={isSplitEditorActive ? "secondary" : "ghost"}
                size="sm"
                asChild
                className="h-7 gap-1.5 cursor-pointer"
              >
                <Link href="/split-editor">
                  <Columns className="h-3.5 w-3.5" />
                  Panel View
                </Link>
              </Button>
              <Button
                variant={isCompact ? "secondary" : "ghost"}
                size="sm"
                onClick={toggleCompact}
                className="h-7 gap-1.5 cursor-pointer"
                title="Toggle compact mode"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Compact
              </Button>
              {/* Compare mode - color tracks by presence across panels */}
              {supportsCompare && (
                <Button
                  variant={isCompareEnabled ? "secondary" : "ghost"}
                  size="sm"
                  onClick={toggleCompare}
                  className="h-7 gap-1.5 cursor-pointer"
                  title="Compare mode: color tracks by presence across panels"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Compare
                </Button>
              )}
              {/* Clear Markers - only show when markers exist */}
              {markerStats.totalMarkers > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllMarkers}
                  className="h-7 gap-1.5 cursor-pointer"
                  title={`Clear all ${markerStats.totalMarkers} marker${markerStats.totalMarkers > 1 ? 's' : ''} in ${markerStats.playlistCount} playlist${markerStats.playlistCount > 1 ? 's' : ''}`}
                >
                  <MapPinOff className="h-3.5 w-3.5" />
                  Clear Markers
                  <span className="text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                    {markerStats.totalMarkers}
                  </span>
                </Button>
              )}
              {/* Stats link - only visible to allowed users */}
              {hasStatsAccess && (
                <Button
                  variant={isStatsActive ? "secondary" : "ghost"}
                  size="sm"
                  asChild
                  className="h-7 gap-1.5 cursor-pointer"
                >
                  <Link href="/stats">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Stats
                  </Link>
                </Button>
              )}
              <div className="w-px h-4 bg-border mx-2" />
              {/* Desktop Logout button */}
              {!loading && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 gap-1.5 cursor-pointer text-muted-foreground"
                >
                  <Link href="/logout">
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </Link>
                </Button>
              )}
            </div>

            {/* Mobile navigation - dropdown menu visible on smaller screens */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                    <Menu className="h-4 w-4" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/playlists" className="flex items-center gap-2 cursor-pointer">
                      <ListMusic className="h-4 w-4" />
                      Playlists
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/split-editor" className="flex items-center gap-2 cursor-pointer">
                      <Columns className="h-4 w-4" />
                      Panel View
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleCompact} className="flex items-center gap-2 cursor-pointer">
                    <Minimize2 className="h-4 w-4" />
                    Compact
                    {isCompact && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
                  </DropdownMenuItem>
                  {supportsCompare && (
                    <DropdownMenuItem onClick={toggleCompare} className="flex items-center gap-2 cursor-pointer">
                      <GitCompare className="h-4 w-4" />
                      Compare
                      {isCompareEnabled && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
                    </DropdownMenuItem>
                  )}
                  {markerStats.totalMarkers > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearAllMarkers} className="flex items-center gap-2 cursor-pointer">
                        <MapPinOff className="h-4 w-4" />
                        Clear Markers
                        <span className="ml-auto text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                          {markerStats.totalMarkers}
                        </span>
                      </DropdownMenuItem>
                    </>
                  )}
                  {hasStatsAccess && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/stats" className="flex items-center gap-2 cursor-pointer">
                          <BarChart3 className="h-4 w-4" />
                          Stats
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/logout" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/privacy" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      Privacy
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/imprint" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      Imprint
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
        
        {/* Show Login button when not authenticated */}
        {!loading && !authenticated && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 gap-1.5 cursor-pointer"
          >
            <Link href="/login">
              <LogIn className="h-3.5 w-3.5" />
              Login
            </Link>
          </Button>
        )}
      </nav>
    </header>
  );
}
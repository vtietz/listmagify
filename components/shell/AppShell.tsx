"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useBrowsePanelStore } from "@/hooks/useBrowsePanelStore";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { useCompareModeStore } from "@/hooks/useCompareModeStore";
import { useAutoScrollTextStore } from "@/hooks/useAutoScrollTextStore";
import { useInsertionPointsStore } from "@/hooks/useInsertionPointsStore";
import { useSessionUser } from "@/hooks/useSessionUser";
import { useStatsAccess } from "@/hooks/useStatsAccess";
import { useDeviceType } from "@/hooks/useDeviceType";
import { SpotifyPlayer } from "@/components/player";
import { BrowsePanel } from "@/components/split-editor/browse/BrowsePanel";
import { AppLogo } from "@/components/ui/app-logo";
import { AppFooter } from "@/components/ui/app-footer";
import { AnyAuthGuard } from "@/components/auth/AnyAuthGuard";
import { cn } from "@/lib/utils";
import { useAppShellLayout } from "@/hooks/shell/useAppShellLayout";
import {
  AdaptiveNav,
  LoginButton,
  type MarkerStats,
} from "./HeaderComponents";

type AppShellProps = {
  headerTitle?: string;
  children?: React.ReactNode;
};

function PlayerWithSuspense() {
  return (
    <Suspense fallback={null}>
      <SpotifyPlayer />
    </Suspense>
  );
}

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
  const { mode, supportsBrowsePanel } = useAppShellLayout({
    pathname,
    authenticated,
    isPhone,
    isBrowsePanelOpen,
  });

  if (mode === 'standalone') {
    return <>{children}</>;
  }

  const renderByMode: Record<'landing-auth' | 'content' | 'fixed' | 'default', () => React.ReactNode> = {
    'landing-auth': () => (
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <Header title={headerTitle} />
        <main className="flex-1 overflow-auto">{children}</main>
        <div className="flex-shrink-0 px-4 py-2 border-t border-border">
          <AppFooter showSpotifyAttribution={false} />
        </div>
      </div>
    ),
    content: () => (
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <Header title={headerTitle} />
        <main className="flex-1 overflow-auto">{children}</main>
        {!isPhone && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border">
            <AppFooter showSpotifyAttribution={false} />
          </div>
        )}
      </div>
    ),
    fixed: () => (
      <FixedHeightLayout pathname={pathname} title={headerTitle} isPhone={isPhone}>
        {children}
      </FixedHeightLayout>
    ),
    default: () => (
      <DefaultLayout
        title={headerTitle}
        isPhone={isPhone}
        authenticated={authenticated}
        isBrowsePanelOpen={isBrowsePanelOpen}
        supportsBrowsePanel={supportsBrowsePanel}
      >
        {children}
      </DefaultLayout>
    ),
  };

  return <>{renderByMode[mode]()}</>;
}

function FixedHeightLayout({
  pathname,
  title,
  isPhone,
  children,
}: {
  pathname: string;
  title: string;
  isPhone: boolean;
  children: React.ReactNode;
}) {
  const isSplitEditor = pathname === '/split-editor';

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <Header title={title} />
      <main className="flex-1 min-h-0 overflow-hidden">
        <AnyAuthGuard>{children}</AnyAuthGuard>
      </main>
      {!isPhone && !isSplitEditor && <PlayerWithSuspense />}
      {!isPhone && (
        <div className="flex-shrink-0 px-4 py-1 border-t border-border">
          <AppFooter />
        </div>
      )}
    </div>
  );
}

function DefaultLayout({
  title,
  isPhone,
  authenticated,
  isBrowsePanelOpen,
  supportsBrowsePanel,
  children,
}: {
  title: string;
  isPhone: boolean;
  authenticated: boolean;
  isBrowsePanelOpen: boolean;
  supportsBrowsePanel: boolean;
  children: React.ReactNode;
}) {
  const showBrowsePanel = authenticated && isBrowsePanelOpen && supportsBrowsePanel;

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-shrink-0 bg-background">
        <Header title={title} />
      </div>
      <AnyAuthGuard>
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          <main className="flex-1 min-w-0 overflow-auto">{children}</main>
          {showBrowsePanel && (
            <div className={cn(isPhone ? 'absolute inset-0 z-50 bg-background' : 'relative')}>
              <BrowsePanel isMobileOverlay={isPhone} />
            </div>
          )}
        </div>
      </AnyAuthGuard>
      {!isPhone && (
        <div className="flex-shrink-0 bg-background">
          <PlayerWithSuspense />
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
  const { isEnabled: isAutoScrollText, toggle: toggleAutoScrollText } = useAutoScrollTextStore();
  const { isEnabled: isCompareEnabled, toggle: toggleCompare } = useCompareModeStore();
  const { isOpen: isBrowseOpen, toggle: toggleBrowse } = useBrowsePanelStore();
  const { isPlayerVisible, togglePlayerVisible } = usePlayerStore();
  const clearAllMarkers = useInsertionPointsStore((s) => s.clearAll);
  const playlists = useInsertionPointsStore((s) => s.playlists);
  const { authenticated, loading } = useSessionUser();
  const { hasAccess: hasStatsAccess } = useStatsAccess();
  const { isPhone } = useDeviceType();
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
  const isAdminActive = pathname === '/admin' || pathname.startsWith('/admin/');
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
            supportsBrowse={!isLandingPage && !isPlaylistsActive && !isAdminActive}
            isPlayerVisible={isPlayerVisible}
            togglePlayerVisible={togglePlayerVisible}
            supportsPlayer={supportsPlayerAndCompare}
            supportsCompact={!isLandingPage}
            isCompact={isCompact}
            toggleCompact={toggleCompact}
            isAutoScrollText={isAutoScrollText}
            toggleAutoScrollText={toggleAutoScrollText}
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
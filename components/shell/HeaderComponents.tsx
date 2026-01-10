/**
 * Header subcomponents for AppShell.
 * 
 * Provides an adaptive navigation system with progressive overflow:
 * - Portrait phone: Shows burger menu (≡) with all items
 * - Landscape/Desktop: Shows items inline, overflows to three-dot menu (⋯) when space is tight
 * 
 * Items are defined once and conditionally rendered based on available space.
 */

'use client';

import Link from 'next/link';
import { 
  ListMusic, 
  LogIn, 
  LogOut, 
  Minimize2, 
  MapPinOff, 
  BarChart3, 
  GitCompare, 
  Menu, 
  Shield, 
  FileText, 
  Columns, 
  Search,
  Music2,
  MoreHorizontal,
  // Github brand icon is deprecated in lucide-react but still functional
  // TODO: Consider migrating to SimpleIcons in the future
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// Types
// ============================================================================

export interface MarkerStats {
  playlistIds: string[];
  playlistCount: number;
  totalMarkers: number;
}

interface AdaptiveNavProps {
  /** Whether we're in portrait phone mode (use burger menu) */
  isPhone: boolean;
  /** Current pathname for active state */
  pathname: string;
  /** Whether stats access is available */
  hasStatsAccess: boolean;
  /** Whether browse panel is open */
  isBrowseOpen: boolean;
  /** Toggle browse panel */
  toggleBrowse: () => void;
  /** Whether player is visible */
  isPlayerVisible: boolean;
  /** Toggle player visibility */
  togglePlayerVisible: () => void;
  /** Whether player toggle should be shown (split-editor/playlists pages) */
  supportsPlayer: boolean;
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Toggle compact mode */
  toggleCompact: () => void;
  /** Whether compare mode is enabled */
  isCompareEnabled: boolean;
  /** Toggle compare mode */
  toggleCompare: () => void;
  /** Whether compare toggle should be shown */
  supportsCompare: boolean;
  /** Marker statistics */
  markerStats: MarkerStats;
  /** Clear all markers */
  clearAllMarkers: () => void;
}

// ============================================================================
// AdaptiveNav - Unified navigation with progressive overflow
// ============================================================================

export function AdaptiveNav({
  isPhone,
  pathname,
  hasStatsAccess,
  isBrowseOpen,
  toggleBrowse,
  isPlayerVisible,
  togglePlayerVisible,
  supportsPlayer,
  isCompact,
  toggleCompact,
  isCompareEnabled,
  toggleCompare,
  supportsCompare,
  markerStats,
  clearAllMarkers,
}: AdaptiveNavProps) {
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  const isStatsActive = pathname === '/stats' || pathname.startsWith('/stats/');

  // Portrait phone: Always show burger menu
  if (isPhone) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Menu className="h-4 w-4" />
            <span className="sr-only">Menu</span>
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
              Panels
            </Link>
          </DropdownMenuItem>
          {hasStatsAccess && (
            <DropdownMenuItem asChild>
              <Link href="/stats" className="flex items-center gap-2 cursor-pointer">
                <BarChart3 className="h-4 w-4" />
                Stats
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* Browse and Player are handled by bottom nav, so exclude them here */}
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
    );
  }

  // Landscape/Desktop: Show all items inline (no overflow for now - can be added later with ResizeObserver)
  return (
    <div className="flex items-center gap-1">
      {/* Main navigation */}
      <Button
        variant={isPlaylistsActive ? 'secondary' : 'ghost'}
        size="sm"
        asChild
        className="h-7 gap-1.5 cursor-pointer"
      >
        <Link href="/playlists">
          <ListMusic className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Playlists</span>
        </Link>
      </Button>
      <Button
        variant={isSplitEditorActive ? 'secondary' : 'ghost'}
        size="sm"
        asChild
        className="h-7 gap-1.5 cursor-pointer"
      >
        <Link href="/split-editor">
          <Columns className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Panels</span>
        </Link>
      </Button>
      {hasStatsAccess && (
        <Button
          variant={isStatsActive ? 'secondary' : 'ghost'}
          size="sm"
          asChild
          className="h-7 gap-1.5 cursor-pointer"
        >
          <Link href="/stats">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Stats</span>
          </Link>
        </Button>
      )}

      {/* Mode toggles */}
      <Button
        variant={isBrowseOpen ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleBrowse}
        className="h-7 gap-1.5 cursor-pointer"
        title="Toggle browse panel"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Browse</span>
      </Button>
      {supportsPlayer && (
        <Button
          variant={isPlayerVisible ? 'secondary' : 'ghost'}
          size="sm"
          onClick={togglePlayerVisible}
          className="h-7 gap-1.5 cursor-pointer"
          title="Toggle player"
        >
          <Music2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Player</span>
        </Button>
      )}
      <Button
        variant={isCompact ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleCompact}
        className="h-7 gap-1.5 cursor-pointer"
        title="Toggle compact mode"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Compact</span>
      </Button>
      {supportsCompare && (
        <Button
          variant={isCompareEnabled ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleCompare}
          className="h-7 gap-1.5 cursor-pointer"
          title="Compare mode"
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Compare</span>
        </Button>
      )}

      {/* Overflow menu with remaining items */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2" title="More options">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {markerStats.totalMarkers > 0 && (
            <>
              <DropdownMenuItem onClick={clearAllMarkers} className="flex items-center gap-2 cursor-pointer">
                <MapPinOff className="h-4 w-4" />
                Clear Markers
                <span className="ml-auto text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                  {markerStats.totalMarkers}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href="/logout" className="flex items-center gap-2 cursor-pointer">
              <LogOut className="h-4 w-4" />
              Logout
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="https://github.com/vtietz/listmagify" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer text-muted-foreground">
              <Github className="h-4 w-4" />
              GitHub
            </Link>
          </DropdownMenuItem>
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
  );
}

// ============================================================================
// LoginButton - Login link with icon
// ============================================================================

export function LoginButton() {
  return (
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
  );
}

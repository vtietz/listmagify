/**
 * Header subcomponents for AppShell.
 * 
 * Extracted from the monolithic Header component for better separation of concerns:
 * - NavLinks: Main navigation buttons
 * - ModeToggles: Compact mode, compare mode, browse panel toggles
 * - MarkerSummary: Clear markers button with badge
 * - MobileMenu: Dropdown menu for mobile devices
 */

'use client';

import React from 'react';
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
  Search 
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

interface NavLinksProps {
  isPlaylistsActive: boolean;
  isSplitEditorActive: boolean;
  hasStatsAccess: boolean;
  isStatsActive: boolean;
}

interface ModeTogglesProps {
  isBrowseOpen: boolean;
  toggleBrowse: () => void;
  isCompact: boolean;
  toggleCompact: () => void;
  isCompareEnabled: boolean;
  toggleCompare: () => void;
  supportsCompare: boolean;
}

interface MarkerSummaryProps {
  markerStats: MarkerStats;
  clearAllMarkers: () => void;
}

interface MobileMenuProps {
  isPlaylistsActive: boolean;
  isSplitEditorActive: boolean;
  isStatsActive: boolean;
  isCompact: boolean;
  toggleCompact: () => void;
  isCompareEnabled: boolean;
  toggleCompare: () => void;
  supportsCompare: boolean;
  hasStatsAccess: boolean;
  markerStats: MarkerStats;
  clearAllMarkers: () => void;
}

// ============================================================================
// NavLinks - Main navigation buttons
// ============================================================================

export function NavLinks({ 
  isPlaylistsActive, 
  isSplitEditorActive,
  hasStatsAccess,
  isStatsActive,
}: NavLinksProps) {
  return (
    <>
      <Button
        variant={isPlaylistsActive ? 'secondary' : 'ghost'}
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
        variant={isSplitEditorActive ? 'secondary' : 'ghost'}
        size="sm"
        asChild
        className="h-7 gap-1.5 cursor-pointer"
      >
        <Link href="/split-editor">
          <Columns className="h-3.5 w-3.5" />
          Panels
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
            Stats
          </Link>
        </Button>
      )}
    </>
  );
}

// ============================================================================
// ModeToggles - Browse panel, compact mode, compare mode toggles
// ============================================================================

export function ModeToggles({
  isBrowseOpen,
  toggleBrowse,
  isCompact,
  toggleCompact,
  isCompareEnabled,
  toggleCompare,
  supportsCompare,
}: ModeTogglesProps) {
  return (
    <>
      <Button
        variant={isBrowseOpen ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleBrowse}
        className="h-7 gap-1.5 cursor-pointer"
        title="Toggle browse panel (search & Last.fm)"
      >
        <Search className="h-3.5 w-3.5" />
        Browse
      </Button>
      <Button
        variant={isCompact ? 'secondary' : 'ghost'}
        size="sm"
        onClick={toggleCompact}
        className="h-7 gap-1.5 cursor-pointer"
        title="Toggle compact mode"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        Compact
      </Button>
      {supportsCompare && (
        <Button
          variant={isCompareEnabled ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleCompare}
          className="h-7 gap-1.5 cursor-pointer"
          title="Compare mode: color tracks by presence across panels"
        >
          <GitCompare className="h-3.5 w-3.5" />
          Compare
        </Button>
      )}
    </>
  );
}

// ============================================================================
// MarkerSummary - Clear markers button with badge
// ============================================================================

export function MarkerSummary({ markerStats, clearAllMarkers }: MarkerSummaryProps) {
  if (markerStats.totalMarkers === 0) {
    return null;
  }

  return (
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
  );
}

// ============================================================================
// LogoutButton - Logout link with icon
// ============================================================================

export function LogoutButton() {
  return (
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

// ============================================================================
// MobileMenu - Dropdown menu for mobile devices
// ============================================================================

export function MobileMenu({
  isPlaylistsActive,
  isSplitEditorActive,
  isStatsActive,
  isCompact,
  toggleCompact,
  isCompareEnabled,
  toggleCompare,
  supportsCompare,
  hasStatsAccess,
  markerStats,
  clearAllMarkers,
}: MobileMenuProps) {
  return (
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
            Panels
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
  );
}

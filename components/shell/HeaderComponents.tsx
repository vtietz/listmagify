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

import { useState, useMemo } from 'react';
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
  MessageSquarePlus,
  // Github brand icon is deprecated in lucide-react but still functional
  // TODO: Consider migrating to SimpleIcons in the future
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeedbackDialog } from '@/components/feedback';
import { AdaptiveNav as AdaptiveNavComponent, type NavItem } from '@/components/ui/adaptive-nav';

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  const isStatsActive = pathname === '/stats' || pathname.startsWith('/stats/');

  // Build navigation items array with groups
  const navItems: NavItem[] = useMemo(() => [
    // Group 1: Main navigation
    {
      id: 'playlists',
      icon: <ListMusic className="h-3.5 w-3.5" />,
      label: 'Playlists',
      href: '/playlists',
      isActive: isPlaylistsActive,
      group: 'main',
    },
    {
      id: 'panels',
      icon: <Columns className="h-3.5 w-3.5" />,
      label: 'Panels',
      href: '/split-editor',
      isActive: isSplitEditorActive,
      group: 'main',
    },
    ...(hasStatsAccess ? [{
      id: 'stats',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: 'Stats',
      href: '/stats',
      isActive: isStatsActive,
      group: 'main',
    }] : []),
    // Group 2: View controls (Browse and Player not shown on phone - handled by bottom nav)
    ...(!isPhone ? [{
      id: 'browse',
      icon: <Search className="h-3.5 w-3.5" />,
      label: 'Browse',
      onClick: toggleBrowse,
      isActive: isBrowseOpen,
      showCheckmark: true,
      group: 'view',
    }] : []),
    ...(!isPhone && supportsPlayer ? [{
      id: 'player',
      icon: <Music2 className="h-3.5 w-3.5" />,
      label: 'Player',
      onClick: togglePlayerVisible,
      isActive: isPlayerVisible,
      showCheckmark: true,
      group: 'view',
    }] : []),
    {
      id: 'compact',
      icon: <Minimize2 className="h-3.5 w-3.5" />,
      label: 'Compact',
      onClick: toggleCompact,
      isActive: isCompact,
      showCheckmark: true,
      group: 'view',
    },
    ...(supportsCompare ? [{
      id: 'compare',
      icon: <GitCompare className="h-3.5 w-3.5" />,
      label: 'Compare',
      onClick: toggleCompare,
      isActive: isCompareEnabled,
      showCheckmark: true,
      group: 'view',
    }] : []),
    // Group 3: Actions (markers)
    ...(markerStats.totalMarkers > 0 ? [{
      id: 'markers',
      icon: <MapPinOff className="h-3.5 w-3.5" />,
      label: 'Clear Markers',
      onClick: clearAllMarkers,
      group: 'actions',
      badge: (
        <span className="ml-1 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
          {markerStats.totalMarkers}
        </span>
      ),
    }] : []),
    // Group 4: User actions
    {
      id: 'logout',
      icon: <LogOut className="h-3.5 w-3.5" />,
      label: 'Logout',
      href: '/logout',
      group: 'user',
    },
    // Group 5: Footer items (only visible on phone in burger menu)
    ...(isPhone ? [{
      id: 'feedback',
      icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
      label: 'Feedback',
      onClick: () => setFeedbackOpen(true),
      group: 'footer',
      separator: 'before' as const,
    },
    {
      id: 'github',
      icon: <Github className="h-3.5 w-3.5" />,
      label: 'GitHub',
      href: 'https://github.com/vtietz/listmagify',
      group: 'footer',
    },
    {
      id: 'privacy',
      icon: <Shield className="h-3.5 w-3.5" />,
      label: 'Privacy',
      href: '/privacy',
      group: 'footer',
    },
    {
      id: 'imprint',
      icon: <FileText className="h-3.5 w-3.5" />,
      label: 'Imprint',
      href: '/imprint',
      group: 'footer',
    }] : []),
  ], [
    isPhone,
    isPlaylistsActive, isSplitEditorActive, isStatsActive, hasStatsAccess,
    isBrowseOpen, toggleBrowse, isPlayerVisible, togglePlayerVisible, supportsPlayer,
    isCompact, toggleCompact, isCompareEnabled, toggleCompare, supportsCompare,
    markerStats.totalMarkers, clearAllMarkers,
  ]);

  return (
    <>
      <AdaptiveNavComponent
        items={navItems}
        layoutMode={isPhone ? 'burger' : 'horizontal'}
        burgerIcon={<Menu className="h-4 w-4" />}
      />
      <FeedbackDialog trigger={null} open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
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

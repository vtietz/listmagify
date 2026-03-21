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

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
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
  TextCursorInput,
  // Github brand icon is deprecated in lucide-react but still functional
  // TODO: Consider migrating to SimpleIcons in the future
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAuthSummary } from '@/hooks/auth/useAuth';
import { useMusicProviderId } from '@/hooks/useMusicProviderId';
import { FeedbackDialog } from '@/components/feedback';
import { AdaptiveNav as AdaptiveNavComponent, type NavItem } from '@/components/ui/adaptive-nav';
import { providerAuthRegistry } from '@/lib/providers/authRegistry';
import { createProviderAuthState } from '@/lib/providers/types';
import type { ProviderId } from '@/lib/providers/types';

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
  /** Whether browse panel toggle should be shown */
  supportsBrowse?: boolean;
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
  /** Whether compact toggle should be shown */
  supportsCompact?: boolean;
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Toggle compact mode */
  toggleCompact: () => void;
  /** Whether auto-scroll text mode is enabled */
  isAutoScrollText: boolean;
  /** Toggle auto-scroll text mode */
  toggleAutoScrollText: () => void;
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

interface AppConfigResponse {
  availableProviders?: ProviderId[];
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'spotify' || value === 'tidal';
}

function useHeaderProviders(): ProviderId[] {
  const { data } = useQuery({
    queryKey: ['app-config-header-providers'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      if (!response.ok) {
        return { availableProviders: ['spotify'] } satisfies AppConfigResponse;
      }

      return response.json() as Promise<AppConfigResponse>;
    },
    staleTime: Infinity,
  });

  const providers = data?.availableProviders;
  if (!providers || providers.length === 0) {
    return ['spotify'];
  }

  return providers.filter(isProviderId);
}

function withProviderInCallbackUrl(callbackUrl: string, providerId: ProviderId): string {
  try {
    if (callbackUrl.startsWith('/')) {
      const [rawPath, rawQuery] = callbackUrl.split('?');
      const path = rawPath ?? callbackUrl;
      const params = new URLSearchParams(rawQuery ?? '');
      params.set('provider', providerId);
      const serialized = params.toString();
      return serialized.length > 0 ? `${path}?${serialized}` : path;
    }

    const url = new URL(callbackUrl);
    url.searchParams.set('provider', providerId);
    return url.toString();
  } catch {
    return callbackUrl;
  }
}

export function HeaderProviderStatus() {
  const summary = useAuthSummary();
  const { update } = useSession();
  const currentProviderId = useMusicProviderId();
  const providers = useHeaderProviders();
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  const statusMap = useMemo(() => ({
    spotify: summary.spotify.code === 'ok' ? 'connected' : 'disconnected',
    tidal: summary.tidal.code === 'ok' ? 'connected' : 'disconnected',
  } as const), [summary.spotify.code, summary.tidal.code]);

  const handleProviderChange = useCallback((providerId: ProviderId) => {
    if (summary[providerId].code === 'ok') {
      return;
    }

    const callbackUrl = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/split-editor';
    const callbackUrlWithProvider = withProviderInCallbackUrl(callbackUrl, providerId);

    if (isE2EMode) {
      void fetch(`/api/test/login?provider=${providerId}`, {
        method: 'GET',
        cache: 'no-store',
      }).finally(() => {
        providerAuthRegistry.setState(createProviderAuthState(providerId, 'ok', true, Date.now()));
      });
      return;
    }

    void signIn(providerId, { callbackUrl: callbackUrlWithProvider });
  }, [isE2EMode, summary]);

  const handleProviderLogout = useCallback(async (providerId: ProviderId) => {
    if (isE2EMode) {
      await fetch(`/api/test/logout?provider=${providerId}`, {
        method: 'GET',
        cache: 'no-store',
      });
    } else if (typeof update === 'function') {
      await update({ providerAuthAction: 'logout-provider', providerId });
    }

    providerAuthRegistry.setState(createProviderAuthState(providerId, 'unauthenticated', false, Date.now()));
  }, [isE2EMode, update]);

  return (
    <ProviderStatusDropdown
      context="header"
      currentProviderId={currentProviderId}
      providers={providers}
      statusMap={statusMap}
      onProviderChange={handleProviderChange}
      onProviderLogout={handleProviderLogout}
      data-testid="header-provider-status-dropdown"
    />
  );
}

// ============================================================================
// AdaptiveNav - Unified navigation with progressive overflow
// ============================================================================

export function AdaptiveNav({
  isPhone,
  pathname,
  supportsBrowse = true,
  hasStatsAccess,
  isBrowseOpen,
  toggleBrowse,
  isPlayerVisible,
  togglePlayerVisible,
  supportsPlayer,
  supportsCompact = true,
  isCompact,
  toggleCompact,
  isAutoScrollText,
  toggleAutoScrollText,
  isCompareEnabled,
  toggleCompare,
  supportsCompare,
  markerStats,
  clearAllMarkers,
}: AdaptiveNavProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  const isStatsActive = pathname === '/admin' || pathname.startsWith('/admin/');

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
      neverOverflow: true,
    },
    {
      id: 'panels',
      icon: <Columns className="h-3.5 w-3.5" />,
      label: 'Panels',
      href: '/split-editor',
      isActive: isSplitEditorActive,
      group: 'main',
      neverOverflow: true,
    },
    ...(hasStatsAccess ? [{
      id: 'admin',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: 'Admin',
      href: '/admin',
      isActive: isStatsActive,
      group: 'main',
    }] : []),
    // Group 2: View controls (Player not shown on phone - handled by bottom nav)
    // Browse not shown on phone - browse panel doesn't work well on small screens
    ...(!isPhone && supportsBrowse ? [{
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
    ...(supportsCompact ? [{
      id: 'compact',
      icon: <Minimize2 className="h-3.5 w-3.5" />,
      label: 'Compact',
      onClick: toggleCompact,
      isActive: isCompact,
      showCheckmark: true,
      group: 'view',
    }] : []),
    ...(supportsCompact ? [{
      id: 'auto-scroll',
      icon: <TextCursorInput className="h-3.5 w-3.5" />,
      label: 'Scroll Text',
      onClick: toggleAutoScrollText,
      isActive: isAutoScrollText,
      showCheckmark: true,
      group: 'view',
    }] : []),
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
    supportsBrowse,
    isPlaylistsActive, isSplitEditorActive, isStatsActive, hasStatsAccess,
    isBrowseOpen, toggleBrowse, isPlayerVisible, togglePlayerVisible, supportsPlayer,
    supportsCompact,
    isCompact, toggleCompact, isAutoScrollText, toggleAutoScrollText,
    isCompareEnabled, toggleCompare, supportsCompare,
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

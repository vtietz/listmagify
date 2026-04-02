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
  MapPinOff,
  BarChart3,
  Menu,
  Shield,
  FileText,
  Columns,
  Search,
  Music2,
  MessageSquarePlus,
  Settings2,
  RefreshCw,
  Import,
  // Github brand icon is deprecated in lucide-react but still functional
  // TODO: Consider migrating to SimpleIcons in the future
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderStatusDropdown } from '@/components/auth/ProviderStatusDropdown';
import { useAuthSummary } from '@features/auth/hooks/useAuth';
import { useMusicProviderId } from '@features/auth/hooks/useMusicProviderId';
import { FeedbackDialog } from '@/components/feedback';
import { AdaptiveNav as AdaptiveNavComponent, type NavItem } from '@/components/ui/adaptive-nav';
import { syncProviderAuthStatusWithRetry } from '@/lib/providers/syncProviderAuth';
import type { ProviderId } from '@/lib/providers/types';
import { ConfigDialog } from '@widgets/shell/config/ConfigDialog';
import { cn } from '@/lib/utils';
import { useSyncDialogStore } from '@features/sync/stores/useSyncDialogStore';
import { useSyncActivityStore } from '@features/sync/stores/useSyncActivityStore';
import { useImportManagementStore } from '@features/import/stores/useImportManagementStore';
import { useImportActivityStore } from '@features/import/stores/useImportActivityStore';
import { useSyncAttention } from '@features/sync/hooks/useSyncAttention';

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
  /** Whether links to secured areas should be shown */
  showSecureLinks?: boolean;
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
  /** Whether compact mode is enabled */
  isCompact: boolean;
  /** Set compact mode */
  setCompact: (value: boolean) => void;
  /** Whether auto-scroll text mode is enabled */
  isAutoScrollText: boolean;
  /** Set auto-scroll text mode */
  setAutoScrollText: (value: boolean) => void;
  /** Whether compare mode is enabled */
  isCompareEnabled: boolean;
  /** Set compare mode */
  setCompareEnabled: (value: boolean) => void;
  /** Whether compare toggle should be shown */
  supportsCompare: boolean;
  /** Marker statistics */
  markerStats: MarkerStats;
  /** Clear all markers */
  clearAllMarkers: () => void;
  /** Whether multiple music providers are connected (enables sync) */
  multipleProvidersConnected?: boolean;
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
      void (async () => {
        await fetch(`/api/test/login?provider=${providerId}`, {
          method: 'GET',
          cache: 'no-store',
        });
        // Re-sync from server to get the authoritative state after cookie update
        await syncProviderAuthStatusWithRetry();
      })();
      return;
    }

    // Backup existing provider tokens before OAuth redirect so the JWT callback
    // can restore them (NextAuth v4 creates a fresh token on sign-in).
    void (async () => {
      await fetch('/api/auth/preserve-tokens', { method: 'POST' }).catch(() => {});
      void signIn(providerId, { callbackUrl: callbackUrlWithProvider });
    })();
  }, [isE2EMode, summary]);

  const handleProviderLogout = useCallback(async (providerId: ProviderId) => {
    if (summary[providerId].code !== 'ok') {
      return;
    }

    if (isE2EMode) {
      await fetch(`/api/test/logout?provider=${providerId}`, {
        method: 'GET',
        cache: 'no-store',
      });
      await syncProviderAuthStatusWithRetry();
      return;
    }

    if (typeof update === 'function') {
      await update({ providerAuthAction: 'logout-provider', providerId });
    }

    await syncProviderAuthStatusWithRetry();
  }, [isE2EMode, summary, update]);

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
  showSecureLinks = true,
  pathname,
  supportsBrowse = true,
  hasStatsAccess,
  isBrowseOpen,
  toggleBrowse,
  isPlayerVisible,
  togglePlayerVisible,
  supportsPlayer,
  isCompact,
  setCompact,
  isAutoScrollText,
  setAutoScrollText,
  isCompareEnabled,
  setCompareEnabled,
  supportsCompare,
  markerStats,
  clearAllMarkers,
  multipleProvidersConnected = false,
}: AdaptiveNavProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const openManagement = useSyncDialogStore((s) => s.openManagement);
  const isSyncing = useSyncActivityStore((s) => s.activeSyncCount > 0);
  const { attentionCount: syncAttentionCount } = useSyncAttention(showSecureLinks && multipleProvidersConnected);
  const openImportManagement = useImportManagementStore((s) => s.openManagement);
  const isImporting = useImportActivityStore((s) => s.isImportActive);
  const headerProviders = useHeaderProviders();
  const isSingleProvider = headerProviders.length <= 1;
  
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  const isStatsActive = pathname === '/admin' || pathname.startsWith('/admin/');

  // Build view-group items separately to keep each useMemo under complexity limit
  const viewItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [];
    if (!isPhone && supportsBrowse) {
      items.push({
        id: 'browse',
        icon: <Search className="h-3.5 w-3.5" />,
        label: 'Browse',
        onClick: toggleBrowse,
        isActive: isBrowseOpen,
        showCheckmark: true,
        visible: showSecureLinks,
        group: 'view',
      });
    }
    if (!isPhone && supportsPlayer) {
      items.push({
        id: 'player',
        icon: <Music2 className="h-3.5 w-3.5" />,
        label: 'Player',
        onClick: togglePlayerVisible,
        isActive: isPlayerVisible,
        showCheckmark: true,
        group: 'view',
      });
    }
    items.push({
      id: 'import',
      icon: <Import className={cn('h-3.5 w-3.5', isImporting && 'animate-spin')} />,
      label: 'Import',
      onClick: openImportManagement,
      visible: showSecureLinks && multipleProvidersConnected,
      group: 'view',
    });
    items.push({
      id: 'sync',
      icon: <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />,
      label: 'Sync',
      onClick: openManagement,
      visible: showSecureLinks && multipleProvidersConnected,
      group: 'view',
      ...(syncAttentionCount > 0 ? {
        badge: (
          <span className="ml-1 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full">
            {syncAttentionCount}
          </span>
        ),
      } : {}),
    });
    items.push({
      id: 'config',
      icon: <Settings2 className="h-3.5 w-3.5" />,
      label: 'Config',
      onClick: () => setConfigOpen(true),
      visible: showSecureLinks,
      group: 'view',
    });
    return items;
  }, [
    isPhone, showSecureLinks, supportsBrowse,
    isBrowseOpen, toggleBrowse, isPlayerVisible, togglePlayerVisible, supportsPlayer,
    openManagement, isSyncing, syncAttentionCount, openImportManagement, isImporting, multipleProvidersConnected,
    setConfigOpen,
  ]);

  // Build full navigation items array by combining groups
  const navItems: NavItem[] = useMemo(() => [
    // Group 1: Main navigation
    {
      id: 'playlists',
      icon: <ListMusic className="h-3.5 w-3.5" />,
      label: 'Playlists',
      href: '/playlists',
      isActive: isPlaylistsActive,
      visible: showSecureLinks,
      group: 'main',
      neverOverflow: true,
    },
    {
      id: 'panels',
      icon: <Columns className="h-3.5 w-3.5" />,
      label: 'Panels',
      href: '/split-editor',
      isActive: isSplitEditorActive,
      visible: showSecureLinks,
      group: 'main',
      neverOverflow: true,
    },
    ...(hasStatsAccess ? [{
      id: 'admin',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: 'Admin',
      href: '/admin',
      isActive: isStatsActive,
      visible: showSecureLinks,
      group: 'main',
    }] : []),
    // Group 2: View controls (built separately)
    ...viewItems,
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
    // Group 4: User actions (logout only for single-provider; multi-provider uses /logout page)
    ...(isSingleProvider ? [{
      id: 'logout',
      icon: <LogOut className="h-3.5 w-3.5" />,
      label: 'Logout',
      href: '/logout',
      group: 'user',
    }] : []),
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
    showSecureLinks,
    isPlaylistsActive, isSplitEditorActive, isStatsActive, hasStatsAccess,
    viewItems,
    markerStats.totalMarkers, clearAllMarkers,
    isSingleProvider,
  ]);

  return (
    <>
      <AdaptiveNavComponent
        items={navItems}
        layoutMode={isPhone ? 'burger' : 'horizontal'}
        burgerIcon={
          <span className="relative">
            <Menu className="h-4 w-4" />
            {syncAttentionCount > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </span>
        }
      />
      <FeedbackDialog trigger={null} open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        isCompact={isCompact}
        setCompact={setCompact}
        isAutoScrollText={isAutoScrollText}
        setAutoScrollText={setAutoScrollText}
        isCompareEnabled={isCompareEnabled}
        setCompareEnabled={setCompareEnabled}
        supportsCompare={supportsCompare}
      />
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

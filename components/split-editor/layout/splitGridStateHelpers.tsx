'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Loader2 } from 'lucide-react';
import { BrowsePanel } from '../browse/BrowsePanel';
import type { PanelConfig, SplitNode } from '@/hooks/useSplitGridStore';
import { TABLET_PERFORMANCE_WARNING_THRESHOLD } from '@/hooks/useDeviceType';
import { SignInButton } from '@/components/auth/SignInButton';
import { toast } from '@/lib/ui/toast';

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AuthPrompt() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <LogIn className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Sign in to continue</h2>
        <p className="text-muted-foreground">
          You need to be signed in with your Spotify account to use the playlist editor.
        </p>
        <SignInButton callbackUrl="/split-editor" />
      </div>
    </div>
  );
}

export function EmptySplitState({
  isBrowsePanelOpen,
}: {
  isBrowsePanelOpen: boolean;
}) {
  return (
    <div className="flex h-full">
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Click &quot;Split Horizontal&quot; or &quot;Split Vertical&quot; to add a panel</p>
      </div>
      {isBrowsePanelOpen && <BrowsePanel />}
    </div>
  );
}

export function useRedirectToPlaylistsIfNeeded({
  authenticated,
  loading,
  root,
  panelCount,
  router,
  searchParams,
}: {
  authenticated: boolean;
  loading: boolean;
  root: SplitNode | null;
  panelCount: number;
  router: ReturnType<typeof useRouter>;
  searchParams: ReturnType<typeof useSearchParams>;
}) {
  useEffect(() => {
    const hasLayoutParam = searchParams.has('layout');
    const hasNoPanels = !root || panelCount === 0;
    const provider = searchParams.get('provider');
    const providerQuery = provider === 'spotify' || provider === 'tidal' ? `?provider=${provider}` : '';

    if (authenticated && !loading && !hasLayoutParam && hasNoPanels) {
      router.replace(`/playlists${providerQuery}`);
    }
  }, [authenticated, loading, root, panelCount, router, searchParams]);
}

export function useMiniPlayerVisibilityEffects({
  isPlaying,
  isMiniPlayerHidden,
  setMiniPlayerHidden,
  isPhone,
  activeOverlay,
}: {
  isPlaying: boolean;
  isMiniPlayerHidden: boolean;
  setMiniPlayerHidden: (hidden: boolean) => void;
  isPhone: boolean;
  activeOverlay: string;
}) {
  useEffect(() => {
    if (isPlaying && isMiniPlayerHidden) {
      setMiniPlayerHidden(false);
    }
  }, [isPlaying, isMiniPlayerHidden, setMiniPlayerHidden]);

  useEffect(() => {
    if (isPhone && activeOverlay === 'player' && isMiniPlayerHidden) {
      setMiniPlayerHidden(false);
    }
  }, [isPhone, activeOverlay, isMiniPlayerHidden, setMiniPlayerHidden]);
}

export function usePhonePanelAutoFocus({
  isPhone,
  panels,
  focusedPanelId,
  focusPanel,
}: {
  isPhone: boolean;
  panels: PanelConfig[];
  focusedPanelId: string | null;
  focusPanel: (id: string) => void;
}) {
  useEffect(() => {
    if (isPhone && panels.length > 0 && !focusedPanelId) {
      focusPanel(panels[0]!.id);
    }
  }, [isPhone, panels, focusedPanelId, focusPanel]);
}

export function useTabletPerformanceWarning({
  isTablet,
  panelCount,
}: {
  isTablet: boolean;
  panelCount: number;
}) {
  useEffect(() => {
    if (isTablet && panelCount > TABLET_PERFORMANCE_WARNING_THRESHOLD) {
      toast.info(
        `You have ${panelCount} panels open. Consider closing some for better performance.`,
        { duration: 5000 }
      );
    }
  }, [isTablet, panelCount]);
}
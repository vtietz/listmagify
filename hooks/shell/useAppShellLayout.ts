import { useEffect } from 'react';
import { useBrowsePanelStore } from '@/hooks/useBrowsePanelStore';

type UseAppShellLayoutInput = {
  pathname: string;
  authenticated: boolean;
  isPhone: boolean;
  isBrowsePanelOpen: boolean;
};

type ShellMode = 'standalone' | 'landing-auth' | 'content' | 'fixed' | 'default';

const CONTENT_PAGES = new Set(['/privacy', '/imprint', '/logout']);

function supportsBrowsePanelPath(pathname: string): boolean {
  if (pathname === '/') {
    return false;
  }

  if (pathname === '/playlists') {
    return false;
  }

  return !(pathname === '/stats' || pathname.startsWith('/stats/'));
}

function resolveShellMode(pathname: string, authenticated: boolean): ShellMode {
  const isLandingPage = pathname === '/';

  if (pathname === '/login' || (isLandingPage && !authenticated)) {
    return 'standalone';
  }

  if (isLandingPage && authenticated) {
    return 'landing-auth';
  }

  if (CONTENT_PAGES.has(pathname)) {
    return 'content';
  }

  if (pathname === '/split-editor' || pathname.startsWith('/playlists/')) {
    return 'fixed';
  }

  return 'default';
}

export function useAppShellLayout({
  pathname,
  authenticated,
  isPhone,
  isBrowsePanelOpen,
}: UseAppShellLayoutInput) {
  const closeBrowsePanel = useBrowsePanelStore((state) => state.close);
  const supportsBrowsePanel = supportsBrowsePanelPath(pathname);

  useEffect(() => {
    if (!isBrowsePanelOpen) {
      return;
    }

    if (isPhone || !supportsBrowsePanel) {
      closeBrowsePanel();
    }
  }, [closeBrowsePanel, isBrowsePanelOpen, isPhone, supportsBrowsePanel]);

  return {
    mode: resolveShellMode(pathname, authenticated),
    supportsBrowsePanel,
  };
}

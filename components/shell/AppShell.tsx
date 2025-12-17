"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Music2, ListMusic, Columns2, LogIn, LogOut, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrowsePanelStore } from "@/hooks/useBrowsePanelStore";
import { usePlayerStore } from "@/hooks/usePlayerStore";
import { useCompactModeStore } from "@/hooks/useCompactModeStore";
import { useSessionUser } from "@/hooks/useSessionUser";
import { SpotifyPlayer } from "@/components/player";

type AppShellProps = {
  headerTitle?: string;
  children?: React.ReactNode;
};

export function AppShell({ headerTitle = "Spotify Playlist Studio", children }: AppShellProps) {
  const pathname = usePathname();
  
  // Pages that need fixed viewport height (no global scrolling)
  const isFixedHeightPage = pathname === '/split-editor' || 
                            pathname === '/playlists' || 
                            pathname.startsWith('/playlists/');
  
  // Landing page and other pages can scroll normally
  if (!isFixedHeightPage) {
    return (
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <Header title={headerTitle} />
        <main className="flex-1">{children}</main>
        <SpotifyPlayer />
      </div>
    );
  }

  // Split editor and playlist pages use fixed height layout
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <Header title={headerTitle} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      <SpotifyPlayer />
    </div>
  );
}

function Header({ title }: { title: string }) {
  const pathname = usePathname();
  const { isOpen, toggle } = useBrowsePanelStore();
  const { isPlayerVisible, togglePlayerVisible } = usePlayerStore();
  const { isCompact, toggle: toggleCompact } = useCompactModeStore();
  const { authenticated, loading } = useSessionUser();
  
  const isPlaylistsActive = pathname === '/playlists' || pathname.startsWith('/playlists/');
  const isSplitEditorActive = pathname === '/split-editor';
  
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <div className="flex items-center gap-2">
        <Logo />
        <Link href="/" className="font-semibold hover:underline">
          {title}
        </Link>
      </div>

      <nav className="flex items-center gap-1 text-sm">
        {/* Only show nav items when authenticated */}
        {authenticated && (
          <>
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
                <Columns2 className="h-3.5 w-3.5" />
                Split Editor
              </Link>
            </Button>
            <Button
              variant={isOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={toggle}
              className="h-7 gap-1.5 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              Browse
            </Button>
            <Button
              variant={isPlayerVisible ? "secondary" : "ghost"}
              size="sm"
              onClick={togglePlayerVisible}
              className="h-7 gap-1.5 cursor-pointer"
            >
              <Music2 className="h-3.5 w-3.5" />
              Player
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
            <div className="w-px h-4 bg-border mx-2" />
          </>
        )}
        
        {/* Show Login or Logout based on auth state */}
        {!loading && (
          authenticated ? (
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
          ) : (
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
          )
        )}
      </nav>
    </header>
  );
}

function Logo() {
  return (
    <span aria-label="App logo" className="inline-block w-5 h-5 rounded-full bg-emerald-500" />
  );
}
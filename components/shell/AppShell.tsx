"use client";

import React from "react";
import Link from "next/link";
import { Separator } from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SplitSquareHorizontal, SplitSquareVertical, Copy, Move } from "lucide-react";
import { useSplitGridStore, MAX_PANELS_LIMIT } from "@/hooks/useSplitGridStore";

type AppShellProps = {
  headerTitle?: string;
  children?: React.ReactNode;
};

export function AppShell({ headerTitle = "Spotify Playlist Editor", children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <Header title={headerTitle} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  const addSplit = useSplitGridStore((state) => state.addSplit);
  const globalDnDMode = useSplitGridStore((state) => state.globalDnDMode);
  const setGlobalDnDMode = useSplitGridStore((state) => state.setGlobalDnDMode);
  const panels = useSplitGridStore((state) => state.panels);
  
  const canAddPanel = panels.length < MAX_PANELS_LIMIT;
  const tooltipText = canAddPanel ? undefined : `Maximum of ${MAX_PANELS_LIMIT} panels`;

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="font-semibold">{title}</span>
      </div>

      {/* Split Grid Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => addSplit('horizontal')}
          disabled={!canAddPanel}
          title={tooltipText || 'Split Horizontal'}
          className="h-8"
        >
          <SplitSquareHorizontal className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Split H</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => addSplit('vertical')}
          disabled={!canAddPanel}
          title={tooltipText || 'Split Vertical'}
          className="h-8"
        >
          <SplitSquareVertical className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Split V</span>
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant={globalDnDMode === 'move' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGlobalDnDMode(globalDnDMode === 'move' ? 'copy' : 'move')}
          title={`Mode: ${globalDnDMode === 'move' ? 'Move (remove from source)' : 'Copy (keep in source)'}`}
          className="h-8"
        >
          {globalDnDMode === 'move' ? (
            <Move className="h-4 w-4 mr-1" />
          ) : (
            <Copy className="h-4 w-4 mr-1" />
          )}
          <span className="hidden sm:inline">
            {globalDnDMode === 'move' ? 'Move' : 'Copy'}
          </span>
        </Button>
      </div>

      <nav className="flex items-center gap-3 text-sm">
        <Link href="/playlists" className="hover:underline">
          Playlists
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <Link href="/split-editor" className="hover:underline">
          Split Editor
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <Link href="/logout" className="text-muted-foreground hover:underline">
          Logout
        </Link>
      </nav>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className={cn("w-52 border-r p-3 text-sm hidden md:block")}>
      <div className="font-medium mb-2">Navigation</div>
      <ul className="space-y-1">
        <li>
          <Link href="/playlists" className="hover:underline">
            My Playlists
          </Link>
        </li>
      </ul>
    </aside>
  );
}

function Logo() {
  return (
    <span aria-label="App logo" className="inline-block w-5 h-5 rounded-full bg-emerald-500" />
  );
}
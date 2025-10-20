"use client";

import React from "react";
import Link from "next/link";
import { Separator } from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";
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
  const panels = useSplitGridStore((state) => state.panels);
  
  const canAddPanel = panels.length < MAX_PANELS_LIMIT;
  const tooltipText = canAddPanel ? undefined : `Maximum of ${MAX_PANELS_LIMIT} panels`;

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="font-semibold">{title}</span>
      </div>

      {/* Removed global split controls - now per-panel via toolbar */}

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
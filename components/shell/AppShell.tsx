"use client";

import React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Separator } from "@radix-ui/react-separator";
import { Button } from "@/components/ui/button";
import { useBrowsePanelStore } from "@/hooks/useBrowsePanelStore";

type AppShellProps = {
  headerTitle?: string;
  children?: React.ReactNode;
};

export function AppShell({ headerTitle = "Spotify Playlist Editor", children }: AppShellProps) {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <Header title={headerTitle} />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}

function Header({ title }: { title: string }) {
  const { isOpen, toggle } = useBrowsePanelStore();
  
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b">
      <div className="flex items-center gap-2">
        <Logo />
        <Link href="/" className="font-semibold hover:underline">
          {title}
        </Link>
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
        <Button
          variant={isOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={toggle}
          className="h-7 gap-1.5"
        >
          <Search className="h-3.5 w-3.5" />
          Browse
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <Link href="/logout" className="text-muted-foreground hover:underline">
          Logout
        </Link>
      </nav>
    </header>
  );
}

function Logo() {
  return (
    <span aria-label="App logo" className="inline-block w-5 h-5 rounded-full bg-emerald-500" />
  );
}
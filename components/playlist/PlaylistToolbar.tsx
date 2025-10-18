"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export interface PlaylistToolbarProps {
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  disabled?: boolean;
}

/**
 * Toolbar for playlist management with debounced search and refresh button.
 * 
 * Features:
 * - Debounced search input (300ms delay)
 * - Refresh button with loading state and tooltip
 * - Keyboard accessible controls
 * - Disabled state support
 */
export function PlaylistToolbar({
  onSearchChange,
  onRefresh,
  isRefreshing,
  disabled = false,
}: PlaylistToolbarProps) {
  const [searchValue, setSearchValue] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, onSearchChange]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!isRefreshing && !disabled) {
      onRefresh();
    }
  }, [onRefresh, isRefreshing, disabled]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by title, artist, or album..."
          value={searchValue}
          onChange={handleSearchChange}
          disabled={disabled}
          className="pl-9"
          aria-label="Search tracks"
        />
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={handleRefresh}
        disabled={isRefreshing || disabled}
        title={isRefreshing ? "Refreshing..." : "Refresh playlist from Spotify"}
        aria-label={isRefreshing ? "Refreshing playlist" : "Refresh playlist"}
        className="shrink-0"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </Button>
    </div>
  );
}

/**
 * PanelToolbar component for individual playlist panels.
 * Includes search, reload, lock indicator, close, and playlist selector.
 */

'use client';

import { useState } from 'react';
import { Search, RefreshCw, Lock, X, SplitSquareHorizontal, SplitSquareVertical, Move, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface PanelToolbarProps {
  panelId: string;
  playlistId: string | null;
  playlistName?: string;
  isEditable: boolean;
  dndMode: 'move' | 'copy';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onReload: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onDndModeToggle: () => void;
  onLoadPlaylist?: (playlistId: string) => void;
}

export function PanelToolbar({
  panelId,
  playlistId,
  playlistName,
  isEditable,
  dndMode,
  searchQuery,
  onSearchChange,
  onReload,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onDndModeToggle,
  onLoadPlaylist,
}: PanelToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    // Debounce is handled by the parent component
    onSearchChange(value);
  };

  return (
    <div className="flex items-center gap-2 p-2 border-b border-border bg-card">
      {/* Playlist name or empty state */}
      <div className="flex-1 min-w-0 px-2">
        {playlistId ? (
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{playlistName || 'Playlist'}</span>
            {!isEditable && (
              <div title="This playlist is read-only">
                <Lock
                  className="h-4 w-4 text-muted-foreground flex-shrink-0"
                  aria-label="Read-only playlist"
                />
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No playlist loaded</span>
        )}
      </div>

      {/* Search */}
      {playlistId && (
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search tracks..."
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      {/* Reload */}
      {playlistId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReload}
          className="h-8 w-8 p-0"
          title="Reload playlist"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Reload playlist</span>
        </Button>
      )}

      {/* DnD Mode Toggle (only when editable) */}
      {playlistId && isEditable && (
        <Button
          variant={dndMode === 'move' ? 'default' : 'outline'}
          size="sm"
          onClick={onDndModeToggle}
          className="h-8 px-2"
          title={`Drag mode: ${dndMode === 'move' ? 'Move (remove from source)' : 'Copy (keep in source)'}`}
        >
          {dndMode === 'move' ? (
            <Move className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          <span className="sr-only">{dndMode === 'move' ? 'Move mode' : 'Copy mode'}</span>
        </Button>
      )}

      <Separator orientation="vertical" className="h-6" />

      {/* Split buttons */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onSplitHorizontal}
        className="h-8 w-8 p-0"
        title="Split Horizontal"
      >
        <SplitSquareHorizontal className="h-4 w-4" />
        <span className="sr-only">Split Horizontal</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onSplitVertical}
        className="h-8 w-8 p-0"
        title="Split Vertical"
      >
        <SplitSquareVertical className="h-4 w-4" />
        <span className="sr-only">Split Vertical</span>
      </Button>

      <Separator orientation="vertical" className="h-6" />

      {/* Close */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-8 w-8 p-0"
        title="Close panel"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close panel</span>
      </Button>
    </div>
  );
}

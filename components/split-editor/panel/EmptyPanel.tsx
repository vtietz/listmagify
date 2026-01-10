/**
 * EmptyPanel - Renders the empty state when no playlist is loaded.
 *
 * Composes PanelToolbar with read-only props and displays a placeholder message.
 */

'use client';

import { PanelToolbar } from '../PanelToolbar';

interface EmptyPanelProps {
  /** Unique identifier for this panel */
  panelId: string;
  /** Total number of panels (to disable close button when last panel) */
  panelCount: number;
  /** Handler to load a playlist */
  onLoadPlaylist: (playlistId: string) => void;
  /** Handler to close this panel */
  onClose: () => void;
  /** Handler to split panel horizontally */
  onSplitHorizontal: () => void;
  /** Handler to split panel vertically */
  onSplitVertical: () => void;
}

export function EmptyPanel({
  panelId,
  panelCount,
  onLoadPlaylist,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
}: EmptyPanelProps) {
  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
      <PanelToolbar
        panelId={panelId}
        playlistId={null}
        isEditable={false}
        dndMode="copy"
        locked={false}
        searchQuery=""
        isReloading={false}
        panelCount={panelCount}
        onSearchChange={() => {}}
        onReload={() => {}}
        onClose={onClose}
        onSplitHorizontal={onSplitHorizontal}
        onSplitVertical={onSplitVertical}
        onDndModeToggle={() => {}}
        onLockToggle={() => {}}
        onLoadPlaylist={onLoadPlaylist}
      />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Select a playlist to load</p>
      </div>
    </div>
  );
}

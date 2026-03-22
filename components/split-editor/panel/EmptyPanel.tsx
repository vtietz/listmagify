/**
 * EmptyPanel - Renders the empty state when no playlist is loaded.
 *
 * Composes PanelToolbar with read-only props and displays a placeholder message.
 */

'use client';

import { PanelToolbar } from '../playlist/PanelToolbar';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface EmptyPanelProps {
  /** Unique identifier for this panel */
  panelId: string;
  /** Total number of panels (to disable close button when last panel) */
  panelCount: number;
  /** Current provider for this panel */
  providerId: MusicProviderId;
  /** Handler to load a playlist */
  onLoadPlaylist: (playlistId: string) => void;
  /** Handler to close this panel */
  onClose: () => void;
  /** Handler to split panel horizontally */
  onSplitHorizontal: () => void;
  /** Handler to split panel vertically */
  onSplitVertical: () => void;
  /** Handler to switch provider */
  onProviderChange: (providerId: MusicProviderId) => void;
}

export function EmptyPanel({
  panelId,
  panelCount,
  providerId,
  onLoadPlaylist,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  onProviderChange,
}: EmptyPanelProps) {
  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
      <PanelToolbar
        panelId={panelId}
        providerId={providerId}
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
        onProviderChange={onProviderChange}
        onLoadPlaylist={onLoadPlaylist}
      />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Select a playlist to load</p>
      </div>
    </div>
  );
}

import { create } from 'zustand';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncDirection } from '@/lib/sync/types';

export interface SyncDialogConfig {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncDirection;
  syncPairId?: string;
}

interface SyncDialogState {
  isPreviewOpen: boolean;
  previewConfig: SyncDialogConfig | null;
  /** Whether preview was opened from management dialog (to return on close) */
  returnToManagement: boolean;
  isManagementOpen: boolean;
  openPreview: (config: SyncDialogConfig, fromManagement?: boolean) => void;
  closePreview: () => void;
  openManagement: () => void;
  closeManagement: () => void;
}

export const useSyncDialogStore = create<SyncDialogState>()((set) => ({
  isPreviewOpen: false,
  previewConfig: null,
  returnToManagement: false,
  isManagementOpen: false,
  openPreview: (config: SyncDialogConfig, fromManagement = false) => set({
    isPreviewOpen: true,
    previewConfig: config,
    returnToManagement: fromManagement,
    isManagementOpen: false,
  }),
  closePreview: () => set((state) => ({
    isPreviewOpen: false,
    previewConfig: null,
    returnToManagement: false,
    isManagementOpen: state.returnToManagement,
  })),
  openManagement: () => set({ isManagementOpen: true }),
  closeManagement: () => set({ isManagementOpen: false }),
}));

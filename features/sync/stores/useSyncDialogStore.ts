import { create } from 'zustand';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncDirection } from '@/lib/sync/types';
import type { SyncInterval } from '@/lib/sync/types';

export interface SyncDialogConfig {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string;
  targetProvider: MusicProviderId;
  targetPlaylistId: string;
  direction: SyncDirection;
  syncPairId?: string;
}

export interface SyncManagementDraft {
  sourceProvider: MusicProviderId;
  sourcePlaylistId: string | null;
  targetProvider: MusicProviderId;
  targetPlaylistId: string | null;
  syncInterval: SyncInterval;
}

interface SyncDialogState {
  isPreviewOpen: boolean;
  previewConfig: SyncDialogConfig | null;
  /** Whether preview was opened from management dialog (to return on close) */
  returnToManagement: boolean;
  isManagementOpen: boolean;
  managementDraft: SyncManagementDraft | null;
  openPreview: (config: SyncDialogConfig, fromManagement?: boolean) => void;
  closePreview: () => void;
  openManagement: () => void;
  closeManagement: () => void;
  setManagementDraft: (draft: SyncManagementDraft) => void;
  clearManagementDraft: () => void;
}

export const useSyncDialogStore = create<SyncDialogState>()((set) => ({
  isPreviewOpen: false,
  previewConfig: null,
  returnToManagement: false,
  isManagementOpen: false,
  managementDraft: null,
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
  setManagementDraft: (draft) => set({ managementDraft: draft }),
  clearManagementDraft: () => set({ managementDraft: null }),
}));

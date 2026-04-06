import { create } from 'zustand';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { SyncDirection } from '@/lib/sync/types';
import type { SyncInterval } from '@/lib/sync/types';
import type { SyncPreviewResult, SyncPreviewRun } from '@/lib/sync/types';
import type { SyncApplyResult } from '@/lib/sync/types';

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

export type SyncPreviewSessionStatus = 'running' | 'done' | 'failed';

export interface SyncPreviewSession {
  key: string;
  config: SyncDialogConfig;
  status: SyncPreviewSessionStatus;
  run: SyncPreviewRun | null;
  result: SyncPreviewResult | null;
  errorMessage: string | null;
  applyResult: SyncApplyResult | null;
  applyErrorMessage: string | null;
  updatedAt: number;
}

interface SyncDialogState {
  isPreviewOpen: boolean;
  previewConfig: SyncDialogConfig | null;
  /** Whether preview was opened from management dialog (to return on close) */
  returnToManagement: boolean;
  isManagementOpen: boolean;
  managementDraft: SyncManagementDraft | null;
  previewSessions: Record<string, SyncPreviewSession>;
  openPreview: (config: SyncDialogConfig, fromManagement?: boolean) => void;
  closePreview: () => void;
  openManagement: () => void;
  closeManagement: () => void;
  setManagementDraft: (draft: SyncManagementDraft) => void;
  clearManagementDraft: () => void;
  startPreviewSession: (key: string, config: SyncDialogConfig) => void;
  updatePreviewSessionRun: (key: string, run: SyncPreviewRun) => void;
  completePreviewSession: (key: string, result: SyncPreviewResult, run?: SyncPreviewRun | null) => void;
  failPreviewSession: (key: string, errorMessage: string, run?: SyncPreviewRun | null) => void;
  setPreviewSessionApplyResult: (key: string, result: SyncApplyResult) => void;
  setPreviewSessionApplyError: (key: string, errorMessage: string) => void;
  clearPreviewSession: (key: string) => void;
}

export const useSyncDialogStore = create<SyncDialogState>()((set) => ({
  isPreviewOpen: false,
  previewConfig: null,
  returnToManagement: false,
  isManagementOpen: false,
  managementDraft: null,
  previewSessions: {},
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
    managementDraft: state.returnToManagement && state.previewConfig
      ? {
          sourceProvider: state.previewConfig.sourceProvider,
          sourcePlaylistId: state.previewConfig.sourcePlaylistId,
          targetProvider: state.previewConfig.targetProvider,
          targetPlaylistId: state.previewConfig.targetPlaylistId,
          syncInterval: state.managementDraft?.syncInterval ?? 'off',
        }
      : state.managementDraft,
  })),
  openManagement: () => set({ isManagementOpen: true }),
  closeManagement: () => set({ isManagementOpen: false }),
  setManagementDraft: (draft) => set({ managementDraft: draft }),
  clearManagementDraft: () => set({ managementDraft: null }),
  startPreviewSession: (key, config) => set((state) => ({
    previewSessions: {
      ...state.previewSessions,
      [key]: {
        key,
        config,
        status: 'running',
        run: null,
        result: null,
        errorMessage: null,
        applyResult: null,
        applyErrorMessage: null,
        updatedAt: Date.now(),
      },
    },
  })),
  updatePreviewSessionRun: (key, run) => set((state) => {
    const current = state.previewSessions[key];
    if (!current) return state;
    return {
      previewSessions: {
        ...state.previewSessions,
        [key]: {
          ...current,
          run,
          updatedAt: Date.now(),
        },
      },
    };
  }),
  completePreviewSession: (key, result, run = null) => set((state) => {
    const current = state.previewSessions[key];
    if (!current) return state;
    return {
      previewSessions: {
        ...state.previewSessions,
        [key]: {
          ...current,
          status: 'done',
          result,
          run: run ?? current.run,
          errorMessage: null,
          applyResult: current.applyResult,
          applyErrorMessage: current.applyErrorMessage,
          updatedAt: Date.now(),
        },
      },
    };
  }),
  failPreviewSession: (key, errorMessage, run = null) => set((state) => {
    const current = state.previewSessions[key];
    if (!current) return state;
    return {
      previewSessions: {
        ...state.previewSessions,
        [key]: {
          ...current,
          status: 'failed',
          run: run ?? current.run,
          errorMessage,
          applyResult: current.applyResult,
          applyErrorMessage: current.applyErrorMessage,
          updatedAt: Date.now(),
        },
      },
    };
  }),
  setPreviewSessionApplyResult: (key, result) => set((state) => {
    const current = state.previewSessions[key];
    if (!current) return state;
    return {
      previewSessions: {
        ...state.previewSessions,
        [key]: {
          ...current,
          applyResult: result,
          applyErrorMessage: null,
          updatedAt: Date.now(),
        },
      },
    };
  }),
  setPreviewSessionApplyError: (key, errorMessage) => set((state) => {
    const current = state.previewSessions[key];
    if (!current) return state;
    return {
      previewSessions: {
        ...state.previewSessions,
        [key]: {
          ...current,
          applyErrorMessage: errorMessage,
          updatedAt: Date.now(),
        },
      },
    };
  }),
  clearPreviewSession: (key) => set((state) => {
    if (!state.previewSessions[key]) return state;
    const next = { ...state.previewSessions };
    delete next[key];
    return { previewSessions: next };
  }),
}));

'use client';

import { create } from 'zustand';

export type ImportActivityStatus = 'idle' | 'running' | 'done' | 'failed';

interface ImportActivityState {
  activeImportJobId: string | null;
  isImportActive: boolean;
  activeImportStatus: ImportActivityStatus;
  hasUnacknowledgedCompletion: boolean;
  setActiveImport: (jobId: string | null) => void;
  markImportCompleted: (status: 'done' | 'failed') => void;
  acknowledgeCompletion: () => void;
}

export const useImportActivityStore = create<ImportActivityState>()((set) => ({
  activeImportJobId: null,
  isImportActive: false,
  activeImportStatus: 'idle',
  hasUnacknowledgedCompletion: false,
  setActiveImport: (jobId) => set({
    activeImportJobId: jobId,
    isImportActive: jobId !== null,
    activeImportStatus: jobId ? 'running' : 'idle',
    hasUnacknowledgedCompletion: false,
  }),
  markImportCompleted: (status) => set((state) => {
    if (!state.activeImportJobId) {
      return {
        isImportActive: false,
        activeImportStatus: 'idle',
        hasUnacknowledgedCompletion: false,
      };
    }

    return {
      isImportActive: false,
      activeImportStatus: status,
      hasUnacknowledgedCompletion: true,
    };
  }),
  acknowledgeCompletion: () => set({
    activeImportJobId: null,
    isImportActive: false,
    activeImportStatus: 'idle',
    hasUnacknowledgedCompletion: false,
  }),
}));

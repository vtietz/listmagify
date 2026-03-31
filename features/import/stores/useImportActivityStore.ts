'use client';

import { create } from 'zustand';

interface ImportActivityState {
  activeImportJobId: string | null;
  isImportActive: boolean;
  setActiveImport: (jobId: string | null) => void;
}

export const useImportActivityStore = create<ImportActivityState>()((set) => ({
  activeImportJobId: null,
  isImportActive: false,
  setActiveImport: (jobId) => set({ activeImportJobId: jobId, isImportActive: jobId !== null }),
}));

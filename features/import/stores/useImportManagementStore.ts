'use client';

import { create } from 'zustand';

interface ImportManagementState {
  isManagementOpen: boolean;
  openManagement: () => void;
  closeManagement: () => void;
}

export const useImportManagementStore = create<ImportManagementState>()((set) => ({
  isManagementOpen: false,
  openManagement: () => set({ isManagementOpen: true }),
  closeManagement: () => set({ isManagementOpen: false }),
}));

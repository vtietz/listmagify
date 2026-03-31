import { create } from 'zustand';

interface ImportDialogState {
  isOpen: boolean;
  targetProvider: string | null;
  open: (targetProvider?: string) => void;
  close: () => void;
}

export const useImportDialogStore = create<ImportDialogState>((set) => ({
  isOpen: false,
  targetProvider: null,
  open: (targetProvider) => set({ isOpen: true, targetProvider: targetProvider ?? null }),
  close: () => set({ isOpen: false, targetProvider: null }),
}));

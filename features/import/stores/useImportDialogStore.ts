import { create } from 'zustand';

interface ImportDialogState {
  isOpen: boolean;
  activeJobId: string | null;
  targetProvider: string | null;
  open: (targetProvider: string) => void;
  close: () => void;
  setActiveJobId: (id: string) => void;
  clearJob: () => void;
}

export const useImportDialogStore = create<ImportDialogState>((set) => ({
  isOpen: false,
  activeJobId: null,
  targetProvider: null,

  open: (targetProvider) =>
    set({ isOpen: true, targetProvider, activeJobId: null }),

  close: () =>
    set({ isOpen: false, targetProvider: null, activeJobId: null }),

  setActiveJobId: (id) => set({ activeJobId: id }),

  clearJob: () => set({ activeJobId: null }),
}));

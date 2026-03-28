'use client';

import { create } from 'zustand';

interface SyncActivityState {
  activeSyncCount: number;
  incrementActive: () => void;
  decrementActive: () => void;
}

export const useSyncActivityStore = create<SyncActivityState>()((set) => ({
  activeSyncCount: 0,
  incrementActive: () => set((s) => ({ activeSyncCount: s.activeSyncCount + 1 })),
  decrementActive: () => set((s) => ({ activeSyncCount: Math.max(0, s.activeSyncCount - 1) })),
}));

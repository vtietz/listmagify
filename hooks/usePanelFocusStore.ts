/**
 * Zustand store for managing mobile panel focus state.
 * Handles which panel is currently focused on phones (where only one panel
 * is fully visible at a time) and panel switching gestures.
 */

import { create } from 'zustand';

export interface PanelFocusState {
  /** ID of the currently focused panel (for phones) */
  focusedPanelId: string | null;
  /** Whether the panel switcher UI is visible */
  isSwitcherVisible: boolean;
  /** Focus a specific panel */
  focusPanel: (panelId: string) => void;
  /** Clear focus (no panel focused) */
  clearFocus: () => void;
  /** Toggle panel switcher visibility */
  toggleSwitcher: () => void;
  /** Show panel switcher */
  showSwitcher: () => void;
  /** Hide panel switcher */
  hideSwitcher: () => void;
  /** Cycle to next panel (for swipe gestures) */
  cycleNext: (panelIds: string[]) => void;
  /** Cycle to previous panel (for swipe gestures) */
  cyclePrevious: (panelIds: string[]) => void;
}

export const usePanelFocusStore = create<PanelFocusState>((set, get) => ({
  focusedPanelId: null,
  isSwitcherVisible: true,

  focusPanel: (panelId) => {
    set({ focusedPanelId: panelId });
  },

  clearFocus: () => {
    set({ focusedPanelId: null });
  },

  toggleSwitcher: () => {
    set((state) => ({ isSwitcherVisible: !state.isSwitcherVisible }));
  },

  showSwitcher: () => {
    set({ isSwitcherVisible: true });
  },

  hideSwitcher: () => {
    set({ isSwitcherVisible: false });
  },

  cycleNext: (panelIds) => {
    const { focusedPanelId } = get();
    if (panelIds.length === 0) return;

    if (!focusedPanelId) {
      set({ focusedPanelId: panelIds[0] ?? null });
      return;
    }

    const currentIndex = panelIds.indexOf(focusedPanelId);
    if (currentIndex === -1) {
      set({ focusedPanelId: panelIds[0] ?? null });
      return;
    }

    const nextIndex = (currentIndex + 1) % panelIds.length;
    set({ focusedPanelId: panelIds[nextIndex] ?? null });
  },

  cyclePrevious: (panelIds) => {
    const { focusedPanelId } = get();
    if (panelIds.length === 0) return;

    if (!focusedPanelId) {
      set({ focusedPanelId: panelIds[panelIds.length - 1] ?? null });
      return;
    }

    const currentIndex = panelIds.indexOf(focusedPanelId);
    if (currentIndex === -1) {
      set({ focusedPanelId: panelIds[panelIds.length - 1] ?? null });
      return;
    }

    const prevIndex = (currentIndex - 1 + panelIds.length) % panelIds.length;
    set({ focusedPanelId: panelIds[prevIndex] ?? null });
  },
}));

/**
 * Get the unfocused panel size ratio (30-40% of viewport).
 * Returns a CSS value string.
 */
export function getUnfocusedPanelSize(): string {
  return '35%'; // 35% viewport for unfocused panel
}

/**
 * Get the focused panel size ratio.
 * Returns a CSS value string.
 */
export function getFocusedPanelSize(): string {
  return '65%'; // 65% viewport for focused panel
}

/**
 * Panel size presets for tablet (S/M/L).
 */
export type PanelSizePreset = 'S' | 'M' | 'L';

export const PANEL_SIZE_PRESETS: Record<PanelSizePreset, string> = {
  S: '25%',
  M: '33.33%',
  L: '50%',
};

/**
 * Convert panel size preset to flex basis value.
 */
export function getPanelFlexBasis(preset: PanelSizePreset): string {
  return PANEL_SIZE_PRESETS[preset];
}

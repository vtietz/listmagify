/**
 * Unit tests for the sync dialog Zustand store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncDialogStore } from './useSyncDialogStore';
import type { SyncDialogConfig } from './useSyncDialogStore';

const sampleConfig: SyncDialogConfig = {
  sourceProvider: 'spotify',
  sourcePlaylistId: 'pl-source',
  targetProvider: 'tidal',
  targetPlaylistId: 'pl-target',
  direction: 'a-to-b',
};

beforeEach(() => {
  // Reset store to initial state between tests
  useSyncDialogStore.setState({
    isPreviewOpen: false,
    previewConfig: null,
    returnToManagement: false,
    isManagementOpen: false,
  });
});

describe('useSyncDialogStore', () => {
  describe('openPreview', () => {
    it('sets isPreviewOpen and previewConfig', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig);

      const state = useSyncDialogStore.getState();
      expect(state.isPreviewOpen).toBe(true);
      expect(state.previewConfig).toEqual(sampleConfig);
    });

    it('defaults returnToManagement to false', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig);

      expect(useSyncDialogStore.getState().returnToManagement).toBe(false);
    });

    it('sets returnToManagement to true when fromManagement is true', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig, true);

      expect(useSyncDialogStore.getState().returnToManagement).toBe(true);
    });

    it('closes management dialog when opening preview', () => {
      useSyncDialogStore.setState({ isManagementOpen: true });

      useSyncDialogStore.getState().openPreview(sampleConfig);

      expect(useSyncDialogStore.getState().isManagementOpen).toBe(false);
    });

    it('preserves syncPairId in config when provided', () => {
      const configWithPairId: SyncDialogConfig = {
        ...sampleConfig,
        syncPairId: 'pair-123',
      };

      useSyncDialogStore.getState().openPreview(configWithPairId);

      expect(useSyncDialogStore.getState().previewConfig?.syncPairId).toBe('pair-123');
    });
  });

  describe('closePreview', () => {
    it('clears isPreviewOpen and previewConfig', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig);
      useSyncDialogStore.getState().closePreview();

      const state = useSyncDialogStore.getState();
      expect(state.isPreviewOpen).toBe(false);
      expect(state.previewConfig).toBeNull();
    });

    it('clears returnToManagement flag', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig, true);
      expect(useSyncDialogStore.getState().returnToManagement).toBe(true);

      useSyncDialogStore.getState().closePreview();

      expect(useSyncDialogStore.getState().returnToManagement).toBe(false);
    });

    it('reopens management dialog when returnToManagement was true', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig, true);
      useSyncDialogStore.getState().closePreview();

      expect(useSyncDialogStore.getState().isManagementOpen).toBe(true);
    });

    it('does not reopen management dialog when returnToManagement was false', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig, false);
      useSyncDialogStore.getState().closePreview();

      expect(useSyncDialogStore.getState().isManagementOpen).toBe(false);
    });
  });

  describe('openManagement', () => {
    it('sets isManagementOpen to true', () => {
      useSyncDialogStore.getState().openManagement();

      expect(useSyncDialogStore.getState().isManagementOpen).toBe(true);
    });
  });

  describe('closeManagement', () => {
    it('sets isManagementOpen to false', () => {
      useSyncDialogStore.getState().openManagement();
      useSyncDialogStore.getState().closeManagement();

      expect(useSyncDialogStore.getState().isManagementOpen).toBe(false);
    });
  });

  describe('returnToManagement flow', () => {
    it('supports full round-trip: management -> preview -> close preview -> management', () => {
      // Start with management open
      useSyncDialogStore.getState().openManagement();
      expect(useSyncDialogStore.getState().isManagementOpen).toBe(true);

      // Open preview from management
      useSyncDialogStore.getState().openPreview(sampleConfig, true);
      expect(useSyncDialogStore.getState().isPreviewOpen).toBe(true);
      expect(useSyncDialogStore.getState().isManagementOpen).toBe(false);
      expect(useSyncDialogStore.getState().returnToManagement).toBe(true);

      // Close preview should return to management
      useSyncDialogStore.getState().closePreview();
      expect(useSyncDialogStore.getState().isPreviewOpen).toBe(false);
      expect(useSyncDialogStore.getState().isManagementOpen).toBe(true);
      expect(useSyncDialogStore.getState().returnToManagement).toBe(false);
    });

    it('does not reopen management when preview was opened directly', () => {
      // Open preview directly (not from management)
      useSyncDialogStore.getState().openPreview(sampleConfig);
      expect(useSyncDialogStore.getState().returnToManagement).toBe(false);

      // Close preview
      useSyncDialogStore.getState().closePreview();
      expect(useSyncDialogStore.getState().isManagementOpen).toBe(false);
    });
  });
});

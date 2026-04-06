/**
 * Unit tests for the sync dialog Zustand store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncDialogStore } from './useSyncDialogStore';
import type { SyncDialogConfig } from './useSyncDialogStore';
import type { SyncManagementDraft } from './useSyncDialogStore';
import type { SyncPreviewResult, SyncPreviewRun } from '@/lib/sync/types';

const sampleConfig: SyncDialogConfig = {
  sourceProvider: 'spotify',
  sourcePlaylistId: 'pl-source',
  targetProvider: 'tidal',
  targetPlaylistId: 'pl-target',
  direction: 'a-to-b',
};

const sampleDraft: SyncManagementDraft = {
  sourceProvider: 'spotify',
  sourcePlaylistId: 'source-pl',
  targetProvider: 'tidal',
  targetPlaylistId: 'target-pl',
  syncInterval: '1h',
};

const samplePreviewRun: SyncPreviewRun = {
  id: 'preview-run-1',
  status: 'executing',
  phase: 'computing_diff',
  progress: 42,
  createdBy: 'user-1',
  errorMessage: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
};

const samplePreviewResult: SyncPreviewResult = {
  plan: {
    sourceProvider: 'spotify',
    sourcePlaylistId: 'pl-source',
    targetProvider: 'tidal',
    targetPlaylistId: 'pl-target',
    direction: 'a-to-b',
    items: [],
    summary: { toAdd: 0, toRemove: 0, unresolved: 0 },
  },
  sourceTracks: [],
  targetTracks: [],
};

beforeEach(() => {
  // Reset store to initial state between tests
  useSyncDialogStore.setState({
    isPreviewOpen: false,
    previewConfig: null,
    returnToManagement: false,
    isManagementOpen: false,
    managementDraft: null,
    previewSessions: {},
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

    it('restores management draft from preview config when returning to management', () => {
      useSyncDialogStore.getState().openPreview(sampleConfig, true);
      useSyncDialogStore.getState().closePreview();

      expect(useSyncDialogStore.getState().managementDraft).toEqual({
        sourceProvider: sampleConfig.sourceProvider,
        sourcePlaylistId: sampleConfig.sourcePlaylistId,
        targetProvider: sampleConfig.targetProvider,
        targetPlaylistId: sampleConfig.targetPlaylistId,
        syncInterval: 'off',
      });
    });

    it('preserves existing draft sync interval when restoring from preview config', () => {
      useSyncDialogStore.getState().setManagementDraft({
        ...sampleDraft,
        syncInterval: '1h',
      });
      useSyncDialogStore.getState().openPreview(sampleConfig, true);
      useSyncDialogStore.getState().closePreview();

      expect(useSyncDialogStore.getState().managementDraft?.syncInterval).toBe('1h');
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

  describe('management draft', () => {
    it('stores the add-sync form draft', () => {
      useSyncDialogStore.getState().setManagementDraft(sampleDraft);

      expect(useSyncDialogStore.getState().managementDraft).toEqual(sampleDraft);
    });

    it('clears the add-sync form draft', () => {
      useSyncDialogStore.getState().setManagementDraft(sampleDraft);
      useSyncDialogStore.getState().clearManagementDraft();

      expect(useSyncDialogStore.getState().managementDraft).toBeNull();
    });
  });

  describe('preview sessions', () => {
    it('starts and updates a preview session', () => {
      const key = 'pair::spotify::a::tidal::b';
      const store = useSyncDialogStore.getState();

      store.startPreviewSession(key, sampleConfig);
      store.updatePreviewSessionRun(key, samplePreviewRun);

      const session = useSyncDialogStore.getState().previewSessions[key];
      expect(session).toBeDefined();
      expect(session?.status).toBe('running');
      expect(session?.run).toEqual(samplePreviewRun);
      expect(session?.result).toBeNull();
    });

    it('completes and clears a preview session', () => {
      const key = 'pair::spotify::a::tidal::b';
      const store = useSyncDialogStore.getState();

      store.startPreviewSession(key, sampleConfig);
      store.completePreviewSession(key, samplePreviewResult, {
        ...samplePreviewRun,
        status: 'done',
        progress: 100,
        phase: 'finalizing',
        completedAt: '2026-01-01T00:00:10.000Z',
      });

      const completed = useSyncDialogStore.getState().previewSessions[key];
      expect(completed?.status).toBe('done');
      expect(completed?.result).toEqual(samplePreviewResult);

      store.clearPreviewSession(key);
      expect(useSyncDialogStore.getState().previewSessions[key]).toBeUndefined();
    });

    it('marks a preview session as failed', () => {
      const key = 'pair::spotify::a::tidal::b';
      const store = useSyncDialogStore.getState();

      store.startPreviewSession(key, sampleConfig);
      store.failPreviewSession(key, 'Preview failed due to timeout', samplePreviewRun);

      const failed = useSyncDialogStore.getState().previewSessions[key];
      expect(failed?.status).toBe('failed');
      expect(failed?.errorMessage).toBe('Preview failed due to timeout');
    });
  });
});

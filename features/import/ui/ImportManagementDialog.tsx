'use client';

import { useImportManagementStore } from '@features/import/stores/useImportManagementStore';
import { useImportDialogStore } from '@features/import/stores/useImportDialogStore';
import { useImportHistory } from '@features/import/hooks/useImportHistory';
import { ImportTaskRow } from '@features/import/ui/ImportTaskRow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Import } from 'lucide-react';
import { useImportActivityStore } from '@features/import/stores/useImportActivityStore';
import type { ImportJobWithPlaylists, ImportJobPlaylist } from '@/lib/import/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

/** Flatten jobs into individual playlist tasks with job context */
interface FlattenedTask {
  entry: ImportJobPlaylist;
  sourceProvider: MusicProviderId;
  targetProvider: MusicProviderId;
  jobCreatedAt: string;
  jobCompletedAt: string | null;
  createSyncPair: boolean;
}

function flattenJobs(jobs: ImportJobWithPlaylists[]): { active: FlattenedTask[]; history: FlattenedTask[] } {
  const active: FlattenedTask[] = [];
  const history: FlattenedTask[] = [];

  for (const job of jobs) {
    const isActive = job.status === 'pending' || job.status === 'running';
    for (const entry of job.playlists) {
      const task: FlattenedTask = {
        entry,
        sourceProvider: job.sourceProvider as MusicProviderId,
        targetProvider: job.targetProvider as MusicProviderId,
        jobCreatedAt: job.createdAt,
        jobCompletedAt: job.completedAt,
        createSyncPair: job.createSyncPair,
      };
      if (isActive) {
        active.push(task);
      } else {
        history.push(task);
      }
    }
  }

  return { active, history };
}

export function ImportManagementDialog() {
  const isManagementOpen = useImportManagementStore((s) => s.isManagementOpen);
  const closeManagement = useImportManagementStore((s) => s.closeManagement);
  const openImportDialog = useImportDialogStore((s) => s.open);
  const isImportActive = useImportActivityStore((s) => s.isImportActive);
  const { data, isLoading } = useImportHistory(isManagementOpen);

  const jobs = data?.jobs ?? [];
  const { active, history } = flattenJobs(jobs);

  const handleNewTransfer = () => {
    openImportDialog();
  };

  return (
    <Dialog open={isManagementOpen} onOpenChange={(open) => { if (!open) closeManagement(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import / Transfer</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border pb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewTransfer}
            disabled={isImportActive}
            className="gap-1.5"
          >
            <Import className="h-3.5 w-3.5" />
            New Transfer...
          </Button>
          {isImportActive && (
            <span className="ml-2 text-xs text-muted-foreground">
              An import is already in progress
            </span>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          )}

          {!isLoading && active.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active
              </h3>
              {active.map((task) => (
                <ImportTaskRow
                  key={task.entry.id}
                  entry={task.entry}
                  sourceProvider={task.sourceProvider}
                  targetProvider={task.targetProvider}
                  jobCreatedAt={task.jobCreatedAt}
                  jobCompletedAt={task.jobCompletedAt}
                  createSyncPair={task.createSyncPair}
                />
              ))}
            </div>
          )}

          {!isLoading && history.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                History
              </h3>
              {history.map((task) => (
                <ImportTaskRow
                  key={task.entry.id}
                  entry={task.entry}
                  sourceProvider={task.sourceProvider}
                  targetProvider={task.targetProvider}
                  jobCreatedAt={task.jobCreatedAt}
                  jobCompletedAt={task.jobCompletedAt}
                  createSyncPair={task.createSyncPair}
                />
              ))}
            </div>
          )}

          {!isLoading && active.length === 0 && history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No imports yet. Start a transfer to copy playlists between providers.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

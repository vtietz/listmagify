'use client';

import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Import, Loader2 } from 'lucide-react';
import { useImportDialogStore } from '@/features/import/stores/useImportDialogStore';
import { useImportActivityStore } from '@/features/import/stores/useImportActivityStore';
import { useImportJob, type ImportJobData } from '@/features/import/hooks/useImportJob';
import { ImportPlaylistProgressRow } from '@/features/import/ui/ImportPlaylistStatusRow';

function ProgressViewContent({ data }: { data: ImportJobData }) {
  const acknowledgeCompletion = useImportActivityStore((s) => s.acknowledgeCompletion);
  const { job, playlists } = data;
  const isComplete = job.status === 'done' || job.status === 'failed';
  const doneCount = playlists.filter((p) => p.status === 'done').length;
  const failedCount = playlists.filter((p) => p.status === 'failed').length;
  const partialCount = playlists.filter((p) => p.status === 'partial').length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Import className="h-5 w-5" />
          {isComplete ? 'Import Complete' : 'Importing Playlists'}
        </DialogTitle>
        <DialogDescription>
          {isComplete
            ? `${job.completedPlaylists}/${job.totalPlaylists} playlists processed.`
            : `${job.completedPlaylists}/${job.totalPlaylists} playlists completed...`}
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-72 overflow-auto rounded-md border border-input my-4">
        {playlists.map((entry) => (
          <ImportPlaylistProgressRow key={entry.id} entry={entry} />
        ))}
      </div>

      {isComplete && (
        <div className="text-sm text-muted-foreground px-1 mb-4">
          {doneCount > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {doneCount} imported successfully
            </span>
          )}
          {partialCount > 0 && (
            <>
              {doneCount > 0 && ', '}
              <span className="text-yellow-600 dark:text-yellow-400">
                {partialCount} partially imported
              </span>
            </>
          )}
          {failedCount > 0 && (
            <>
              {(doneCount > 0 || partialCount > 0) && ', '}
              <span className="text-destructive">
                {failedCount} failed
              </span>
            </>
          )}
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          onClick={() => {
            if (isComplete) {
              acknowledgeCompletion();
            }
            useImportDialogStore.getState().close();
          }}
        >
          {isComplete ? 'Close' : 'Close (import continues in background)'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ImportPlaylistsProgressView({ jobId }: { jobId: string }) {
  const { data, isLoading } = useImportJob(jobId);

  if (isLoading || !data) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            Importing Playlists
          </DialogTitle>
          <DialogDescription>
            Starting import...
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return <ProgressViewContent data={data} />;
}

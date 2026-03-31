'use client';

import type { ImportJobPlaylist } from '@/lib/import/types';

interface ImportTaskDetailProps {
  entry: ImportJobPlaylist;
}

export function ImportTaskDetail({ entry }: ImportTaskDetailProps) {
  const isTerminal = entry.status === 'done' || entry.status === 'failed' || entry.status === 'partial';

  return (
    <div className="px-3 pb-2 pt-1 space-y-2">
      {isTerminal && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-green-500/10 p-2 text-center">
            <div className="text-sm font-semibold text-green-500">{entry.tracksAdded}</div>
            <div className="text-[10px] text-muted-foreground">Tracks added</div>
          </div>
          <div className="rounded-md bg-yellow-500/10 p-2 text-center">
            <div className="text-sm font-semibold text-yellow-500">{entry.tracksUnresolved}</div>
            <div className="text-[10px] text-muted-foreground">Unresolved</div>
          </div>
          <div className="rounded-md bg-blue-500/10 p-2 text-center">
            <div className="text-sm font-semibold text-blue-500">{entry.trackCount}</div>
            <div className="text-[10px] text-muted-foreground">Total tracks</div>
          </div>
        </div>
      )}

      {!isTerminal && entry.trackCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {entry.tracksResolved}/{entry.trackCount} tracks resolved
          {entry.tracksAdded > 0 && `, ${entry.tracksAdded} added`}
        </div>
      )}

      {entry.errorMessage && (
        <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-500">
          {entry.errorMessage}
        </div>
      )}
    </div>
  );
}

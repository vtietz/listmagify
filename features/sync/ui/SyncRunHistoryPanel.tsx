'use client';

import { useState } from 'react';
import { useSyncRunHistory } from '@features/sync/hooks/useSyncRunHistory';
import { SyncStatusBadge } from '@features/sync/ui/SyncStatusBadge';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncRun, SyncTrigger } from '@/lib/sync/types';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const minutes = Math.floor(absDiff / 60000);
  if (minutes < 1) return isFuture ? 'in <1m' : 'just now';
  if (minutes < 60) return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isFuture ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

const TRIGGER_LABELS: Record<SyncTrigger, { label: string; className: string }> = {
  manual: { label: 'manual', className: 'text-blue-400' },
  auto_sync: { label: 'auto', className: 'text-green-400' },
  scheduler: { label: 'sched', className: 'text-purple-400' },
};

function TriggerBadge({ trigger }: { trigger: SyncTrigger }) {
  const config = TRIGGER_LABELS[trigger];
  return (
    <span className={cn('text-[10px] font-medium', config.className)}>
      {config.label}
    </span>
  );
}


function RunDetail({ run }: { run: SyncRun }) {
  const hasWarnings = run.warnings.length > 0;

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-green-500/10 p-2 text-center">
          <div className="text-sm font-semibold text-green-500">{run.tracksAdded}</div>
          <div className="text-[10px] text-muted-foreground">Tracks added</div>
        </div>
        <div className="rounded-md bg-red-500/10 p-2 text-center">
          <div className="text-sm font-semibold text-red-500">{run.tracksRemoved}</div>
          <div className="text-[10px] text-muted-foreground">Tracks removed</div>
        </div>
      </div>

      {run.errorMessage && (
        <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-500">
          {run.errorMessage}
        </div>
      )}

      {hasWarnings && (
        <div className="rounded-md bg-yellow-500/10 p-2 text-xs">
          <div className="font-medium text-yellow-500">
            {run.warnings.length} unresolved track(s)
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            These tracks could not be matched on the target provider.
          </p>
          <div className="mt-1.5 max-h-[200px] overflow-y-auto space-y-0.5">
            {run.warnings.map((track) => (
              <div
                key={track.canonicalTrackId}
                className="flex items-center gap-2 py-0.5 text-[10px] border-l-2 border-yellow-500 pl-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{track.title}</div>
                  <div className="truncate text-muted-foreground">
                    {track.artists.join(', ')}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">
                  {track.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run }: { run: SyncRun }) {
  const [showDetail, setShowDetail] = useState(false);
  const hasWarnings = run.warnings.length > 0;
  const timestamp = run.completedAt ?? run.startedAt;

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-2 text-xs w-full text-left hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors"
        onClick={() => setShowDetail(!showDetail)}
      >
        <span
          className="text-[10px] text-muted-foreground whitespace-nowrap w-14 shrink-0"
          title={timestamp}
        >
          {formatRelativeTime(timestamp)}
        </span>
        <TriggerBadge trigger={run.triggeredBy} />
        <SyncStatusBadge status={run.status} className="text-[10px] px-1.5 py-0" />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          +{run.tracksAdded} / -{run.tracksRemoved}
        </span>
        {hasWarnings ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            {run.warnings.length} unmatched
          </span>
        ) : null}
      </button>
      {showDetail && <RunDetail run={run} />}
    </div>
  );
}

export function SyncRunHistoryPanel({ pairId }: { pairId: string }) {
  const { runs, isLoading } = useSyncRunHistory(pairId, true);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground py-1">No sync runs yet.</p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Recent runs
      </p>
      {runs.map((run: SyncRun) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
}

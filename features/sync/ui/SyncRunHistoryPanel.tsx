'use client';

import { useState } from 'react';
import { useSyncRunHistory } from '@features/sync/hooks/useSyncRunHistory';
import { SyncStatusBadge } from '@features/sync/ui/SyncStatusBadge';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncRun, SyncTrigger, SyncWarning } from '@/lib/sync/types';

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

function WarningList({ warnings }: { warnings: SyncWarning[] }) {
  return (
    <div className="mt-1 ml-4 space-y-0.5">
      {warnings.map((w) => (
        <div key={w.canonicalTrackId} className="text-[10px] text-amber-500/80">
          <span className="mr-1">&#9888;</span>
          <span className="font-medium">{w.title}</span>
          <span className="text-muted-foreground"> &mdash; {w.artists.join(', ')}</span>
          <div className="ml-4 text-muted-foreground">{w.reason}</div>
        </div>
      ))}
    </div>
  );
}

function RunRow({ run }: { run: SyncRun }) {
  const [showWarnings, setShowWarnings] = useState(false);
  const hasWarnings = run.warnings.length > 0;
  const timestamp = run.completedAt ?? run.startedAt;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
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
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-400 transition-colors"
            onClick={() => setShowWarnings(!showWarnings)}
          >
            <AlertTriangle className="h-3 w-3" />
            {run.warnings.length} unmatched
          </button>
        ) : null}
      </div>
      {showWarnings && hasWarnings ? <WarningList warnings={run.warnings} /> : null}
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

'use client';

import { Plus, Minus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncDiffItem, SyncPlan } from '@/lib/sync/types';

/** Confidence threshold below which a match is considered uncertain */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

interface SyncDiffTableProps {
  plan: SyncPlan;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function DiffRow({ item }: { item: SyncDiffItem }) {
  const isAdd = item.action === 'add';
  const isLowConfidence = item.confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 text-sm',
        isAdd ? 'bg-green-500/5' : 'bg-red-500/5',
        isLowConfidence && 'border-l-2 border-yellow-500',
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 rounded-full p-1',
          isAdd ? 'text-green-500' : 'text-red-500',
        )}
      >
        {isAdd ? (
          <Plus className="h-3.5 w-3.5" />
        ) : (
          <Minus className="h-3.5 w-3.5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{item.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {item.artists.join(', ')}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isLowConfidence && (
          <span
            className="inline-flex items-center gap-1 text-xs text-yellow-500"
            title={`Match confidence: ${Math.round(item.confidence * 100)}%`}
          >
            <AlertTriangle className="h-3 w-3" />
            {Math.round(item.confidence * 100)}%
          </span>
        )}
        <span className="text-xs text-muted-foreground w-10 text-right">
          {formatDuration(item.durationMs)}
        </span>
      </div>
    </div>
  );
}

export function SyncDiffTable({ plan }: SyncDiffTableProps) {
  const adds = plan.items.filter((item) => item.action === 'add');
  const removes = plan.items.filter((item) => item.action === 'remove');

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex gap-4 text-sm px-1">
        {plan.summary.toAdd > 0 && (
          <span className="text-green-500">
            +{plan.summary.toAdd} to add
          </span>
        )}
        {plan.summary.toRemove > 0 && (
          <span className="text-red-500">
            -{plan.summary.toRemove} to remove
          </span>
        )}
        {plan.summary.unresolved > 0 && (
          <span className="text-yellow-500">
            {plan.summary.unresolved} unresolved
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div className="max-h-[320px] overflow-y-auto rounded-md border border-border divide-y divide-border">
        {adds.map((item) => (
          <DiffRow key={`add-${item.canonicalTrackId}`} item={item} />
        ))}
        {removes.map((item) => (
          <DiffRow key={`remove-${item.canonicalTrackId}`} item={item} />
        ))}
      </div>
    </div>
  );
}

'use client';

import { Plus, Minus, AlertTriangle } from 'lucide-react';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { cn } from '@/lib/utils';
import type { SyncDiffItem, SyncPlan } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

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
        'flex items-center gap-2 px-3 py-1.5 text-sm',
        isAdd ? 'bg-green-500/5' : 'bg-red-500/5',
        isLowConfidence && 'border-l-2 border-yellow-500',
      )}
    >
      <div className={cn('shrink-0', isAdd ? 'text-green-500' : 'text-red-500')}>
        {isAdd ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{item.title}</div>
        <div className="truncate text-xs text-muted-foreground">{item.artists.join(', ')}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isLowConfidence && (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-500" title={`Match confidence: ${Math.round(item.confidence * 100)}%`}>
            <AlertTriangle className="h-3 w-3" />
            {Math.round(item.confidence * 100)}%
          </span>
        )}
        <span className="text-xs text-muted-foreground w-10 text-right">{formatDuration(item.durationMs)}</span>
      </div>
    </div>
  );
}

function ProviderSection({ providerId, label, items }: { providerId: MusicProviderId; label: string; items: SyncDiffItem[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
        <ProviderGlyph providerId={providerId} />
        <span>{label}</span>
        <span className="ml-auto">{items.length} track{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.map((item) => (
        <DiffRow key={`${item.action}-${item.canonicalTrackId}`} item={item} />
      ))}
    </div>
  );
}

export function SyncDiffTable({ plan }: SyncDiffTableProps) {
  // Group items by target provider
  const byProvider = new Map<MusicProviderId, { adds: SyncDiffItem[]; removes: SyncDiffItem[] }>();

  for (const item of plan.items) {
    const key = item.targetProvider;
    if (!byProvider.has(key)) {
      byProvider.set(key, { adds: [], removes: [] });
    }
    const group = byProvider.get(key)!;
    if (item.action === 'add') {
      group.adds.push(item);
    } else {
      group.removes.push(item);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-sm px-1">
        {plan.summary.toAdd > 0 && <span className="text-green-500">+{plan.summary.toAdd} to add</span>}
        {plan.summary.toRemove > 0 && <span className="text-red-500">-{plan.summary.toRemove} to remove</span>}
        {plan.summary.unresolved > 0 && <span className="text-yellow-500">{plan.summary.unresolved} unresolved</span>}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-md border border-border divide-y divide-border">
        {[...byProvider.entries()].map(([providerId, group]) => (
          <div key={providerId}>
            {group.adds.length > 0 && (
              <ProviderSection providerId={providerId} label={`Add to ${providerId === 'spotify' ? 'Spotify' : 'TIDAL'}`} items={group.adds} />
            )}
            {group.removes.length > 0 && (
              <ProviderSection providerId={providerId} label={`Remove from ${providerId === 'spotify' ? 'Spotify' : 'TIDAL'}`} items={group.removes} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

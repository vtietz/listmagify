'use client';

import { useMemo } from 'react';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { cn } from '@/lib/utils';
import type { SyncPreviewTrack, SyncPlan } from '@/lib/sync/types';

interface SyncSplitViewProps {
  plan: SyncPlan;
  sourceTracks: SyncPreviewTrack[];
  targetTracks: SyncPreviewTrack[];
  sourcePlaylistName: string;
  targetPlaylistName: string;
}

type CellState = 'present' | 'add' | 'empty';

interface AlignedRow {
  id: string;
  track: SyncPreviewTrack;
  left: CellState;
  right: CellState;
}

function TrackCell({ track, state }: { track: SyncPreviewTrack; state: CellState }) {
  if (state === 'empty') {
    return <div className="px-2 py-0.5 text-xs">&nbsp;</div>;
  }

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-0.5 text-xs min-w-0',
      state === 'add' && 'bg-green-500/10 text-green-700 dark:text-green-400',
    )}>
      {state === 'add' && <span className="text-green-500 font-bold shrink-0">+</span>}
      <span className="truncate font-medium">{track.title}</span>
      <span className="truncate text-muted-foreground">{track.artists.join(', ')}</span>
    </div>
  );
}

function useAlignedRows(
  sourceTracks: SyncPreviewTrack[],
  targetTracks: SyncPreviewTrack[],
): { rows: AlignedRow[]; addedToSource: number; addedToTarget: number } {
  return useMemo(() => {
    const targetMap = new Map(targetTracks.map((t) => [t.canonicalTrackId, t]));
    const seen = new Set<string>();
    const rows: AlignedRow[] = [];
    let addedToSource = 0;
    let addedToTarget = 0;

    // Walk source order first — shared items + source-only items
    for (const track of sourceTracks) {
      const id = track.canonicalTrackId;
      if (seen.has(id)) continue;
      seen.add(id);

      const inTarget = targetMap.has(id);
      rows.push({
        id,
        track,
        left: 'present',
        right: inTarget ? 'present' : 'add',
      });
      if (!inTarget) addedToTarget++;
    }

    // Then target-only items (not in source)
    for (const track of targetTracks) {
      const id = track.canonicalTrackId;
      if (seen.has(id)) continue;
      seen.add(id);

      rows.push({
        id,
        track,
        left: 'add',
        right: 'present',
      });
      addedToSource++;
    }

    return { rows, addedToSource, addedToTarget };
  }, [sourceTracks, targetTracks]);
}

export function SyncSplitView({
  plan,
  sourceTracks,
  targetTracks,
  sourcePlaylistName,
  targetPlaylistName,
}: SyncSplitViewProps) {
  const { rows, addedToSource, addedToTarget } = useAlignedRows(sourceTracks, targetTracks);

  const resultSourceCount = sourceTracks.length + addedToSource;
  const resultTargetCount = targetTracks.length + addedToTarget;
  const isInSync = addedToSource === 0 && addedToTarget === 0;

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="flex gap-4 text-xs px-1">
        {addedToTarget > 0 && (
          <span className="text-green-500">+{addedToTarget} &rarr; {targetPlaylistName}</span>
        )}
        {addedToSource > 0 && (
          <span className="text-green-500">+{addedToSource} &rarr; {sourcePlaylistName}</span>
        )}
        {isInSync && <span className="text-muted-foreground">Playlists are in sync</span>}
        {plan.summary.unresolved > 0 && (
          <span className="text-yellow-500">{plan.summary.unresolved} unresolved</span>
        )}
      </div>

      {/* Aligned split view */}
      <div className="rounded-md border border-border">
        {/* Column headers */}
        <div className="grid grid-cols-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-r border-border min-w-0">
            <ProviderGlyph providerId={plan.sourceProvider} />
            <span className="truncate">{sourcePlaylistName}</span>
            <span className="ml-auto whitespace-nowrap pl-1">{resultSourceCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border min-w-0">
            <ProviderGlyph providerId={plan.targetProvider} />
            <span className="truncate">{targetPlaylistName}</span>
            <span className="ml-auto whitespace-nowrap pl-1">{resultTargetCount}</span>
          </div>
        </div>

        {/* Scrollable aligned rows */}
        <div className="max-h-[350px] overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-2 border-b border-border/50 last:border-b-0">
              <div className="border-r border-border/50 min-w-0">
                <TrackCell track={row.track} state={row.left} />
              </div>
              <div className="min-w-0">
                <TrackCell track={row.track} state={row.right} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

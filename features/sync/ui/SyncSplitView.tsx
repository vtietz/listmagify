'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { cn } from '@/lib/utils';
import type { SyncPreviewTrack, SyncPlan, SyncDiffItem } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';

interface SyncSplitViewProps {
  plan: SyncPlan;
  sourceTracks: SyncPreviewTrack[];
  targetTracks: SyncPreviewTrack[];
  sourcePlaylistName: string;
  targetPlaylistName: string;
}

type CellState = 'present' | 'added' | 'removed' | 'unresolved' | 'empty';

interface CellData {
  track: { title: string; artists: string[] } | null;
  state: CellState;
}

interface AlignedRow {
  id: string;
  left: CellData;
  right: CellData;
}

function TrackCell({ cell }: { cell: CellData }) {
  if (cell.state === 'empty' || !cell.track) {
    return <div className="px-2 py-0.5 text-xs">&nbsp;</div>;
  }

  const { track, state } = cell;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 text-xs min-w-0',
        state === 'added' && 'bg-green-500/10',
        state === 'removed' && 'bg-red-500/10',
        state === 'unresolved' && 'bg-yellow-500/10',
      )}
    >
      {state === 'added' && (
        <span className="text-green-500 font-bold shrink-0">+</span>
      )}
      {state === 'removed' && (
        <span className="text-red-500 font-bold shrink-0">-</span>
      )}
      {state === 'unresolved' && (
        <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
      )}
      <span
        className={cn(
          'truncate font-medium',
          state === 'removed' && 'line-through text-muted-foreground',
          state === 'unresolved' && 'text-yellow-600 dark:text-yellow-400',
        )}
      >
        {track.title}
      </span>
      <span
        className={cn(
          'truncate text-muted-foreground',
          state === 'removed' && 'line-through',
        )}
      >
        {track.artists.join(', ')}
      </span>
    </div>
  );
}

/** Indexes plan items into add/remove maps keyed by `provider::canonicalTrackId` */
function indexPlanItems(items: SyncDiffItem[]) {
  const adds = new Map<string, SyncDiffItem>();
  const removes = new Map<string, SyncDiffItem>();
  for (const item of items) {
    const key = `${item.targetProvider}::${item.canonicalTrackId}`;
    if (item.action === 'add') adds.set(key, item);
    else removes.set(key, item);
  }
  return { adds, removes };
}

/** Determine the cell state for a track on one side of the split view */
function cellForSide(
  provider: MusicProviderId,
  id: string,
  currentMap: Map<string, SyncPreviewTrack>,
  adds: Map<string, SyncDiffItem>,
  removes: Map<string, SyncDiffItem>,
): CellData {
  const key = `${provider}::${id}`;
  const existing = currentMap.get(id);

  if (existing) {
    const state = removes.has(key) ? 'removed' : 'present';
    return { track: existing, state };
  }

  const addItem = adds.get(key);
  if (addItem) {
    const state = addItem.materializeStatus === 'not_found' ? 'unresolved' : 'added';
    return { track: { title: addItem.title, artists: addItem.artists }, state };
  }

  return { track: null, state: 'empty' };
}

/** Count how many rows have each change state on each side */
function countChanges(rows: AlignedRow[]) {
  let sourceAdded = 0, sourceRemoved = 0, sourceUnresolved = 0;
  let targetAdded = 0, targetRemoved = 0, targetUnresolved = 0;

  for (const row of rows) {
    if (row.left.state === 'added') sourceAdded++;
    if (row.left.state === 'removed') sourceRemoved++;
    if (row.left.state === 'unresolved') sourceUnresolved++;
    if (row.right.state === 'added') targetAdded++;
    if (row.right.state === 'removed') targetRemoved++;
    if (row.right.state === 'unresolved') targetUnresolved++;
  }

  return { sourceAdded, sourceRemoved, sourceUnresolved, targetAdded, targetRemoved, targetUnresolved };
}

function isVisibleOnSide(state: CellState): boolean {
  return state !== 'empty' && state !== 'removed';
}

/**
 * Build aligned rows showing the anticipated result of both playlists
 * side-by-side. Every track appears on both sides — present, added,
 * removed, or unresolved. Both columns have equal length.
 */
function useAlignedAnticipatedResult(
  sourceTracks: SyncPreviewTrack[],
  targetTracks: SyncPreviewTrack[],
  plan: SyncPlan,
) {
  return useMemo(() => {
    const sourceMap = new Map(sourceTracks.map((t) => [t.canonicalTrackId, t]));
    const targetMap = new Map(targetTracks.map((t) => [t.canonicalTrackId, t]));
    const { adds, removes } = indexPlanItems(plan.items);

    const rows: AlignedRow[] = [];
    const seen = new Set<string>();

    // Walk source tracks first (preserves source ordering), then target-only tracks
    const allTracks = [...sourceTracks, ...targetTracks];
    for (const track of allTracks) {
      const id = track.canonicalTrackId;
      if (seen.has(id)) continue;
      seen.add(id);

      const left = cellForSide(plan.sourceProvider, id, sourceMap, adds, removes);
      const right = cellForSide(plan.targetProvider, id, targetMap, adds, removes);
      rows.push({ id, left, right });
    }

    const changes = countChanges(rows);
    const sourceResultCount = rows.filter((r) => isVisibleOnSide(r.left.state)).length;
    const targetResultCount = rows.filter((r) => isVisibleOnSide(r.right.state)).length;

    return {
      rows,
      ...changes,
      sourceResultCount,
      targetResultCount,
      hasChanges: changes.sourceAdded + changes.sourceRemoved + changes.targetAdded + changes.targetRemoved > 0,
    };
  }, [sourceTracks, targetTracks, plan]);
}

export function SyncSplitView({
  plan,
  sourceTracks,
  targetTracks,
  sourcePlaylistName,
  targetPlaylistName,
}: SyncSplitViewProps) {
  const anticipated = useAlignedAnticipatedResult(sourceTracks, targetTracks, plan);

  return (
    <div>
      {!anticipated.hasChanges && (
        <p className="text-xs text-muted-foreground text-center py-2">Playlists are in sync</p>
      )}

      {/* Aligned result split view */}
      <div className="rounded-md border border-border">
        {/* Column headers with inline change counts */}
        <div className="grid grid-cols-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-r border-border min-w-0">
            <ProviderGlyph providerId={plan.sourceProvider} />
            <span className="truncate">{sourcePlaylistName}</span>
            <span className="ml-auto flex items-center gap-1 whitespace-nowrap pl-1">
              {anticipated.sourceResultCount}
              {anticipated.sourceAdded > 0 && <span className="text-green-500">+{anticipated.sourceAdded}</span>}
              {anticipated.sourceRemoved > 0 && <span className="text-red-500">-{anticipated.sourceRemoved}</span>}
              {anticipated.sourceUnresolved > 0 && <span className="text-yellow-500">{anticipated.sourceUnresolved}</span>}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border min-w-0">
            <ProviderGlyph providerId={plan.targetProvider} />
            <span className="truncate">{targetPlaylistName}</span>
            <span className="ml-auto flex items-center gap-1 whitespace-nowrap pl-1">
              {anticipated.targetResultCount}
              {anticipated.targetAdded > 0 && <span className="text-green-500">+{anticipated.targetAdded}</span>}
              {anticipated.targetRemoved > 0 && <span className="text-red-500">-{anticipated.targetRemoved}</span>}
              {anticipated.targetUnresolved > 0 && <span className="text-yellow-500">{anticipated.targetUnresolved}</span>}
            </span>
          </div>
        </div>

        {/* Scrollable aligned rows */}
        <div className="max-h-[350px] overflow-y-auto">
          {anticipated.rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-2 border-b border-border/50 last:border-b-0"
            >
              <div className="border-r border-border/50 min-w-0">
                <TrackCell cell={row.left} />
              </div>
              <div className="min-w-0">
                <TrackCell cell={row.right} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-yellow-500" />
          Not found on target provider
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-green-500 font-bold">+</span>
          Will be added
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-red-500 font-bold">-</span>
          Will be removed
        </span>
      </div>
    </div>
  );
}

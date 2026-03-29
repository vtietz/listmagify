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
    // Index current tracks by canonical ID
    const sourceMap = new Map(sourceTracks.map((t) => [t.canonicalTrackId, t]));
    const targetMap = new Map(targetTracks.map((t) => [t.canonicalTrackId, t]));

    // Index plan items by canonical ID
    const addsByTarget = new Map<string, SyncDiffItem>();
    const removesByTarget = new Map<string, SyncDiffItem>();
    for (const item of plan.items) {
      const key = `${item.targetProvider}::${item.canonicalTrackId}`;
      if (item.action === 'add') addsByTarget.set(key, item);
      else removesByTarget.set(key, item);
    }

    const getAddItem = (provider: MusicProviderId, id: string) =>
      addsByTarget.get(`${provider}::${id}`);
    const isRemovingFrom = (provider: MusicProviderId, id: string) =>
      removesByTarget.has(`${provider}::${id}`);

    const rows: AlignedRow[] = [];
    const seen = new Set<string>();

    let sourceAdded = 0;
    let sourceRemoved = 0;
    let sourceUnresolved = 0;
    let targetAdded = 0;
    let targetRemoved = 0;
    let targetUnresolved = 0;

    // Helper to determine cell state for a side
    function cellForSide(
      provider: MusicProviderId,
      id: string,
      currentMap: Map<string, SyncPreviewTrack>,
    ): CellData {
      const existing = currentMap.get(id);

      // Track already on this side
      if (existing) {
        if (isRemovingFrom(provider, id)) {
          return { track: existing, state: 'removed' };
        }
        return { track: existing, state: 'present' };
      }

      // Track being added to this side
      const addItem = getAddItem(provider, id);
      if (addItem) {
        const isUnresolved = addItem.materializeStatus === 'not_found';
        return {
          track: { title: addItem.title, artists: addItem.artists },
          state: isUnresolved ? 'unresolved' : 'added',
        };
      }

      return { track: null, state: 'empty' };
    }

    // Walk source tracks first (preserves source ordering)
    for (const track of sourceTracks) {
      const id = track.canonicalTrackId;
      if (seen.has(id)) continue;
      seen.add(id);

      const left = cellForSide(plan.sourceProvider, id, sourceMap);
      const right = cellForSide(plan.targetProvider, id, targetMap);
      rows.push({ id, left, right });
    }

    // Then target-only tracks (not in source)
    for (const track of targetTracks) {
      const id = track.canonicalTrackId;
      if (seen.has(id)) continue;
      seen.add(id);

      const left = cellForSide(plan.sourceProvider, id, sourceMap);
      const right = cellForSide(plan.targetProvider, id, targetMap);
      rows.push({ id, left, right });
    }

    // Count changes
    for (const row of rows) {
      if (row.left.state === 'added') sourceAdded++;
      if (row.left.state === 'removed') sourceRemoved++;
      if (row.left.state === 'unresolved') sourceUnresolved++;
      if (row.right.state === 'added') targetAdded++;
      if (row.right.state === 'removed') targetRemoved++;
      if (row.right.state === 'unresolved') targetUnresolved++;
    }

    const sourceResultCount = rows.filter(
      (r) => r.left.state !== 'empty' && r.left.state !== 'removed',
    ).length;
    const targetResultCount = rows.filter(
      (r) => r.right.state !== 'empty' && r.right.state !== 'removed',
    ).length;

    return {
      rows,
      sourceAdded,
      sourceRemoved,
      sourceUnresolved,
      targetAdded,
      targetRemoved,
      targetUnresolved,
      sourceResultCount,
      targetResultCount,
      hasChanges: sourceAdded + sourceRemoved + targetAdded + targetRemoved > 0,
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
    </div>
  );
}

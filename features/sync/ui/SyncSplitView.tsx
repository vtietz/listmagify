'use client';

import { useMemo } from 'react';
import { AlertTriangle, Ban, Clock3, Link2 } from 'lucide-react';
import { ProviderGlyph } from '@/components/auth/ProviderStatusDropdown';
import { cn } from '@/lib/utils';
import type { SyncPreviewTrack, SyncPlan, SyncDiffItem } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { ManualMatchPicker } from '@features/sync/ui/ManualMatchPicker';
import { resolutionKey } from '@features/sync/model/manualResolutions';
import type { ManualResolutionsState } from '@features/sync/hooks/useManualResolutions';

interface SyncSplitViewProps {
  plan: SyncPlan;
  sourceTracks: SyncPreviewTrack[];
  targetTracks: SyncPreviewTrack[];
  sourcePlaylistName: string;
  targetPlaylistName: string;
  /** Enables manual matching / skipping of unresolved tracks */
  manual?: ManualResolutionsState;
}

type CellState = 'present' | 'added' | 'matched' | 'removed' | 'unresolved' | 'timed_out' | 'skipped' | 'empty';

interface CellData {
  track: { title: string; artists: string[] } | null;
  state: CellState;
  /** The plan item behind an added / unresolved cell */
  item?: SyncDiffItem;
}

interface AlignedRow {
  id: string;
  left: CellData;
  right: CellData;
}

const stateBgClass: Partial<Record<CellState, string>> = {
  added: 'bg-green-500/10',
  matched: 'bg-green-500/10',
  removed: 'bg-red-500/10',
  unresolved: 'bg-yellow-500/10',
  timed_out: 'bg-orange-500/10',
};

const stateTitleClass: Partial<Record<CellState, string>> = {
  removed: 'line-through text-muted-foreground',
  unresolved: 'text-yellow-600 dark:text-yellow-400',
  timed_out: 'text-orange-600 dark:text-orange-400',
  skipped: 'text-muted-foreground line-through',
};

const stateArtistClass: Partial<Record<CellState, string>> = {
  removed: 'line-through',
  skipped: 'line-through',
};

function isUnresolvedState(state: CellState): boolean {
  return state === 'unresolved' || state === 'timed_out';
}

function StateIndicator({ state }: { state: CellState }) {
  switch (state) {
    case 'added':
      return <span className="text-green-500 font-bold shrink-0">+</span>;
    case 'removed':
      return <span className="text-red-500 font-bold shrink-0">-</span>;
    case 'unresolved':
      return <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />;
    case 'timed_out':
      return <Clock3 className="h-3 w-3 text-orange-500 shrink-0" />;
    case 'matched':
      return <Link2 className="h-3 w-3 text-green-500 shrink-0" />;
    case 'skipped':
      return <Ban className="h-3 w-3 text-muted-foreground shrink-0" />;
    default:
      return null;
  }
}

function CellAction({ cell, manual }: { cell: CellData; manual: ManualResolutionsState | undefined }) {
  const item = cell.item;
  if (!manual || !item) return null;

  const target = { canonicalTrackId: item.canonicalTrackId, targetProvider: item.targetProvider };
  const buttonClass = 'ml-auto shrink-0 rounded px-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50';

  if (isUnresolvedState(cell.state)) {
    const key = resolutionKey(item.targetProvider, item.canonicalTrackId);
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => manual.setOpenKey(manual.openKey === key ? null : key)}
      >
        Find match
      </button>
    );
  }

  if (cell.state === 'skipped' && manual.canSkip) {
    const skippedHere = manual.resolutions[resolutionKey(item.targetProvider, item.canonicalTrackId)]?.kind === 'skipped';
    return (
      <button
        type="button"
        className={buttonClass}
        disabled={manual.isSaving}
        onClick={() => void manual.unskip(target, !skippedHere)}
      >
        Undo skip
      </button>
    );
  }

  return null;
}

function TrackCell({ cell, manual }: { cell: CellData; manual?: ManualResolutionsState | undefined }) {
  if (cell.state === 'empty' || !cell.track) {
    return <div className="px-2 py-0.5 text-xs">&nbsp;</div>;
  }

  const { track, state } = cell;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 text-xs min-w-0',
        stateBgClass[state],
      )}
    >
      <StateIndicator state={state} />
      <span
        className={cn(
          'truncate font-medium',
          stateTitleClass[state],
        )}
      >
        {track.title}
      </span>
      <span
        className={cn(
          'truncate text-muted-foreground',
          stateArtistClass[state],
        )}
      >
        {track.artists.join(', ')}
      </span>
      <CellAction cell={cell} manual={manual} />
    </div>
  );
}

function addCellState(item: SyncDiffItem): CellState {
  switch (item.materializeStatus) {
    case 'timed_out': return 'timed_out';
    case 'not_found': return 'unresolved';
    case 'skipped': return 'skipped';
    default: return item.manualMatch ? 'matched' : 'added';
  }
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
    return { track: { title: addItem.title, artists: addItem.artists }, state: addCellState(addItem), item: addItem };
  }

  return { track: null, state: 'empty' };
}

/** Count how many rows have each change state on each side */
function countChanges(rows: AlignedRow[]) {
  let sourceAdded = 0, sourceRemoved = 0, sourceUnresolved = 0;
  let targetAdded = 0, targetRemoved = 0, targetUnresolved = 0;

  for (const row of rows) {
    if (isAddedState(row.left.state)) sourceAdded++;
    if (row.left.state === 'removed') sourceRemoved++;
    if (isUnresolvedState(row.left.state)) sourceUnresolved++;
    if (isAddedState(row.right.state)) targetAdded++;
    if (row.right.state === 'removed') targetRemoved++;
    if (isUnresolvedState(row.right.state)) targetUnresolved++;
  }

  return { sourceAdded, sourceRemoved, sourceUnresolved, targetAdded, targetRemoved, targetUnresolved };
}

function isAddedState(state: CellState): boolean {
  return state === 'added' || state === 'matched';
}

function isVisibleOnSide(state: CellState): boolean {
  return state !== 'empty' && state !== 'removed' && state !== 'skipped';
}

/** The unresolved cell of a row whose match picker is open, if any. */
function openPickerCell(row: AlignedRow, manual: ManualResolutionsState | undefined): CellData | null {
  if (!manual?.openKey) return null;
  for (const cell of [row.left, row.right]) {
    if (cell.item && isUnresolvedState(cell.state)
      && resolutionKey(cell.item.targetProvider, cell.item.canonicalTrackId) === manual.openKey) {
      return cell;
    }
  }
  return null;
}

function RowMatchPicker({ cell, manual }: { cell: CellData; manual: ManualResolutionsState }) {
  const item = cell.item!;
  const target = { canonicalTrackId: item.canonicalTrackId, targetProvider: item.targetProvider };

  return (
    <div className="col-span-2">
      <ManualMatchPicker
        source={{ title: item.title, artists: item.artists, durationMs: item.durationMs }}
        targetProvider={item.targetProvider}
        isSaving={manual.isSaving}
        onPick={(track) => void manual.pick(target, track)}
        {...(manual.canSkip ? { onSkip: () => void manual.skip(target) } : {})}
        onClose={() => manual.setOpenKey(null)}
      />
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
  manual,
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
          {anticipated.rows.map((row) => {
            const pickerCell = openPickerCell(row, manual);
            return (
              <div
                key={row.id}
                className="grid grid-cols-2 border-b border-border/50 last:border-b-0"
              >
                <div className="border-r border-border/50 min-w-0">
                  <TrackCell cell={row.left} manual={manual} />
                </div>
                <div className="min-w-0">
                  <TrackCell cell={row.right} manual={manual} />
                </div>
                {pickerCell && manual && <RowMatchPicker cell={pickerCell} manual={manual} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-yellow-500" />
          Not found on target provider
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3 text-orange-500" />
          Lookup timed out (try again)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-green-500 font-bold">+</span>
          Will be added
        </span>
        {manual && (
          <span className="inline-flex items-center gap-1">
            <Link2 className="h-3 w-3 text-green-500" />
            Matched manually
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="text-red-500 font-bold">-</span>
          Will be removed
        </span>
      </div>
    </div>
  );
}

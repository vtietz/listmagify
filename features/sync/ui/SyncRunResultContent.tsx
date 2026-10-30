'use client';

import { Ban, Link2 } from 'lucide-react';
import type { SyncRun, SyncApplyResult } from '@/lib/sync/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import { ManualMatchPicker } from '@features/sync/ui/ManualMatchPicker';
import { resolutionKey } from '@features/sync/model/manualResolutions';
import type { ManualResolutionsState } from '@features/sync/hooks/useManualResolutions';

interface ResultWarning {
  canonicalTrackId: string;
  title: string;
  artists: string[];
  reason: string;
  durationMs: number;
  targetProvider?: MusicProviderId | undefined;
}

interface ResultData {
  added: number;
  removed: number;
  errors: string[];
  warnings: ResultWarning[];
}

function toResultData(source: SyncApplyResult | SyncRun): ResultData {
  if ('tracksAdded' in source) {
    // SyncRun
    return {
      added: source.tracksAdded,
      removed: source.tracksRemoved,
      errors: source.errorMessage ? [source.errorMessage] : [],
      warnings: source.warnings.map((warning) => ({ ...warning, durationMs: 0 })),
    };
  }
  // SyncApplyResult
  return {
    added: source.added,
    removed: source.removed,
    errors: source.errors,
    warnings: source.unresolved.map((info) => ({
      canonicalTrackId: info.canonicalTrackId,
      title: info.title,
      artists: info.artists,
      reason: info.reason === 'not_found' ? 'Not found'
        : info.reason === 'materialize_failed' ? 'Search failed'
        : 'No mapping',
      durationMs: info.durationMs,
      targetProvider: info.targetProvider,
    })),
  };
}

interface SyncRunResultContentProps {
  source: SyncApplyResult | SyncRun;
  /** Enables manual matching / skipping of the unresolved tracks */
  manual?: ManualResolutionsState;
}

const actionClass = 'shrink-0 rounded px-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50';

function WarningStatus({ warning, manual }: { warning: ResultWarning; manual: ManualResolutionsState | undefined }) {
  const provider = warning.targetProvider;
  if (!manual || !provider) {
    return <span className="text-muted-foreground shrink-0">{warning.reason}</span>;
  }

  const target = { canonicalTrackId: warning.canonicalTrackId, targetProvider: provider };
  const key = resolutionKey(provider, warning.canonicalTrackId);
  const resolution = manual.resolutions[key];

  if (resolution?.kind === 'matched') {
    return (
      <span className="flex min-w-0 shrink items-center gap-1 text-green-500">
        <Link2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{resolution.title}</span>
      </span>
    );
  }

  if (resolution?.kind === 'skipped') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <Ban className="h-3 w-3" /> Skipped
        <button type="button" className={actionClass} disabled={manual.isSaving} onClick={() => void manual.unskip(target, false)}>
          Undo
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="text-muted-foreground">{warning.reason}</span>
      <button
        type="button"
        className={actionClass}
        onClick={() => manual.setOpenKey(manual.openKey === key ? null : key)}
      >
        Find match
      </button>
    </span>
  );
}

function WarningRow({ warning, manual }: { warning: ResultWarning; manual: ManualResolutionsState | undefined }) {
  const provider = warning.targetProvider;
  const isPickerOpen = !!manual && !!provider && manual.openKey === resolutionKey(provider, warning.canonicalTrackId);
  const target = provider ? { canonicalTrackId: warning.canonicalTrackId, targetProvider: provider } : null;

  return (
    <div>
      <div className="flex items-center gap-2 py-0.5 text-[10px] border-l-2 border-yellow-500 pl-2">
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium">{warning.title}</div>
          <div className="truncate text-muted-foreground">
            {warning.artists.join(', ')}
          </div>
        </div>
        <WarningStatus warning={warning} manual={manual} />
      </div>
      {isPickerOpen && manual && target && (
        <ManualMatchPicker
          source={{ title: warning.title, artists: warning.artists, durationMs: warning.durationMs }}
          targetProvider={target.targetProvider}
          isSaving={manual.isSaving}
          onPick={(track) => void manual.pick(target, track)}
          {...(manual.canSkip ? { onSkip: () => void manual.skip(target) } : {})}
          onClose={() => manual.setOpenKey(null)}
        />
      )}
    </div>
  );
}

export function SyncRunResultContent({ source, manual }: SyncRunResultContentProps) {
  const data = toResultData(source);
  const hasErrors = data.errors.length > 0;
  const hasWarnings = data.warnings.length > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-green-500/10 p-2 text-center">
          <div className="text-sm font-semibold text-green-500">{data.added}</div>
          <div className="text-[10px] text-muted-foreground">Tracks added</div>
        </div>
        <div className="rounded-md bg-red-500/10 p-2 text-center">
          <div className="text-sm font-semibold text-red-500">{data.removed}</div>
          <div className="text-[10px] text-muted-foreground">Tracks removed</div>
        </div>
      </div>

      {hasWarnings && (
        <div className="rounded-md bg-yellow-500/10 p-2 text-xs">
          <div className="font-medium text-yellow-500">
            {data.warnings.length} unresolved track(s)
          </div>
          <div className="mt-1.5 max-h-[260px] overflow-y-auto space-y-0.5">
            {data.warnings.map((warning) => (
              <WarningRow
                key={`${warning.targetProvider ?? ''}::${warning.canonicalTrackId}`}
                warning={warning}
                manual={manual}
              />
            ))}
          </div>
        </div>
      )}

      {hasErrors && (
        <div className="rounded-md bg-red-500/10 p-2 text-xs">
          <div className="font-medium text-red-500">
            {data.errors.length} error(s)
          </div>
          <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            {data.errors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {data.errors.length > 5 && (
              <li>...and {data.errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

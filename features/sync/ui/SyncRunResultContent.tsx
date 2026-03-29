'use client';

import type { SyncRun, SyncApplyResult } from '@/lib/sync/types';

interface ResultData {
  added: number;
  removed: number;
  errors: string[];
  warnings: { canonicalTrackId: string; title: string; artists: string[]; reason: string }[];
}

function toResultData(source: SyncApplyResult | SyncRun): ResultData {
  if ('tracksAdded' in source) {
    // SyncRun
    return {
      added: source.tracksAdded,
      removed: source.tracksRemoved,
      errors: source.errorMessage ? [source.errorMessage] : [],
      warnings: source.warnings,
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
    })),
  };
}

interface SyncRunResultContentProps {
  source: SyncApplyResult | SyncRun;
}

export function SyncRunResultContent({ source }: SyncRunResultContentProps) {
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
          <div className="mt-1.5 max-h-[200px] overflow-y-auto space-y-0.5">
            {data.warnings.map((track) => (
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

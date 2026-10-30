'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format';
import { DEFAULT_MATCH_THRESHOLDS } from '@/lib/matching/config';
import { getProviderDisplayName } from '@/lib/music-provider/providerLabels';
import type { MusicProviderId, Track } from '@/lib/music-provider/types';
import {
  buildManualMatchQuery,
  useManualMatchSearch,
  type ManualMatchSource,
  type ScoredMatch,
} from '@features/sync/hooks/useManualMatch';

interface ManualMatchPickerProps {
  source: ManualMatchSource;
  targetProvider: MusicProviderId;
  isSaving: boolean;
  onPick: (track: Track) => void;
  /** Omitted when the sync has no saved pair to remember the skip on. */
  onSkip?: () => void;
  onClose: () => void;
}

function scoreClass(score: number): string {
  if (score >= DEFAULT_MATCH_THRESHOLDS.convert) return 'text-green-500';
  if (score >= DEFAULT_MATCH_THRESHOLDS.manual) return 'text-yellow-500';
  return 'text-muted-foreground';
}

/**
 * Inline search for a track that could not be matched automatically.
 * Results are ranked against the source track; picking one saves the match.
 */
export function ManualMatchPicker({
  source,
  targetProvider,
  isSaving,
  onPick,
  onSkip,
  onClose,
}: ManualMatchPickerProps) {
  const [draft, setDraft] = useState(() => buildManualMatchQuery(source));
  const [query, setQuery] = useState(draft);
  const search = useManualMatchSearch(source, targetProvider, query);
  const providerName = getProviderDisplayName(targetProvider);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft);
  };

  return (
    <div className="space-y-1.5 border-y border-border bg-muted/30 px-2 py-2 text-xs" data-testid="manual-match-picker">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium">
          {source.title} <span className="text-muted-foreground">— {source.artists.join(', ')}</span>
        </span>
        {source.durationMs > 0 && (
          <span className="shrink-0 text-muted-foreground">{formatDuration(source.durationMs)}</span>
        )}
        <button
          type="button"
          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close match search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form className="flex gap-1.5" onSubmit={handleSubmit}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-7 text-xs md:text-xs"
          aria-label={`Search ${providerName}`}
          placeholder={`Search ${providerName}`}
          autoFocus
        />
        <Button type="submit" size="sm" variant="outline" className="h-7 px-2" aria-label="Search">
          <Search className="h-3.5 w-3.5" />
        </Button>
      </form>

      <div className="max-h-[180px] overflow-y-auto">
        {search.isFetching && (
          <div className="flex items-center gap-1.5 py-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching {providerName}…
          </div>
        )}
        {search.isError && !search.isFetching && (
          <p className="py-2 text-red-500">Search failed. Try again or change the query.</p>
        )}
        {search.data?.length === 0 && !search.isFetching && (
          <p className="py-2 text-muted-foreground">No results on {providerName}. Try a shorter query.</p>
        )}
        {!search.isFetching && search.data?.map(({ track, score }: ScoredMatch) => (
          <div key={track.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/60">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{track.name}</div>
              <div className="truncate text-muted-foreground">
                {[track.artists.join(', '), track.album?.name].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="shrink-0 text-muted-foreground">{formatDuration(track.durationMs)}</span>
            <span className={cn('w-9 shrink-0 text-right tabular-nums', scoreClass(score))}>
              {Math.round(score * 100)}%
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-xs"
              disabled={isSaving}
              onClick={() => onPick(track)}
            >
              Use
            </Button>
          </div>
        ))}
      </div>

      {onSkip && (
        <div className="flex items-center gap-1 pt-0.5 text-muted-foreground">
          Not on {providerName}?
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
            disabled={isSaving}
            onClick={onSkip}
          >
            Skip this track in future syncs
          </button>
        </div>
      )}
    </div>
  );
}

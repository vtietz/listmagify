/**
 * LastfmResultList - Displays matched Last.fm tracks with Spotify matches
 * 
 * Shows each imported track alongside its Spotify match with confidence indicators.
 */

'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, HelpCircle, ExternalLink } from 'lucide-react';
import type { MatchResult, MatchConfidence } from '@/lib/importers/types';

interface LastfmResultListProps {
  results: MatchResult[];
  selectedUris: Set<string>;
  onToggleSelect: (uri: string) => void;
}

const CONFIDENCE_CONFIG: Record<MatchConfidence, { icon: typeof CheckCircle2; color: string; label: string }> = {
  high: { icon: CheckCircle2, color: 'text-green-500', label: 'Matched' },
  medium: { icon: HelpCircle, color: 'text-yellow-500', label: 'Review' },
  low: { icon: HelpCircle, color: 'text-orange-500', label: 'Low match' },
  none: { icon: XCircle, color: 'text-red-500', label: 'Not found' },
};

export function LastfmResultList({
  results,
  selectedUris,
  onToggleSelect,
}: LastfmResultListProps) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No tracks to display
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {results.map((result, index) => (
        <LastfmResultRow
          key={`${result.imported.trackName}-${result.imported.artistName}-${index}`}
          result={result}
          isSelected={result.spotifyTrack ? selectedUris.has(result.spotifyTrack.uri) : false}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

interface LastfmResultRowProps {
  result: MatchResult;
  isSelected: boolean;
  onToggleSelect: (uri: string) => void;
}

function LastfmResultRow({ result, isSelected, onToggleSelect }: LastfmResultRowProps) {
  const { imported, spotifyTrack, confidence, score } = result;
  const config = CONFIDENCE_CONFIG[confidence];
  const Icon = config.icon;
  
  const canSelect = spotifyTrack !== undefined;
  
  const handleClick = () => {
    if (canSelect && spotifyTrack) {
      onToggleSelect(spotifyTrack.uri);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 transition-colors',
        canSelect && 'cursor-pointer hover:bg-accent/50',
        isSelected && 'bg-accent'
      )}
      onClick={handleClick}
    >
      {/* Selection checkbox */}
      <div className="flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          disabled={!canSelect}
          onChange={() => {
            if (canSelect && spotifyTrack) {
              onToggleSelect(spotifyTrack.uri);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-input disabled:opacity-50"
        />
      </div>

      {/* Last.fm source track */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={imported.trackName}>
          {imported.trackName}
        </div>
        <div className="text-xs text-muted-foreground truncate" title={imported.artistName}>
          {imported.artistName}
          {imported.albumName && (
            <span className="opacity-75"> • {imported.albumName}</span>
          )}
        </div>
        {imported.playcount !== undefined && (
          <div className="text-xs text-muted-foreground">
            {imported.playcount.toLocaleString()} plays
          </div>
        )}
        {imported.playedAt !== undefined && !imported.nowPlaying && (
          <div className="text-xs text-muted-foreground">
            {formatRelativeTime(imported.playedAt)}
          </div>
        )}
        {imported.nowPlaying && (
          <div className="text-xs text-green-500 font-medium">
            Now playing
          </div>
        )}
      </div>

      {/* Arrow separator */}
      <div className="flex-shrink-0 text-muted-foreground">→</div>

      {/* Spotify match */}
      <div className="flex-1 min-w-0">
        {spotifyTrack ? (
          <>
            <div className="text-sm font-medium truncate" title={spotifyTrack.name}>
              {spotifyTrack.name}
            </div>
            <div className="text-xs text-muted-foreground truncate" title={spotifyTrack.artists.join(', ')}>
              {spotifyTrack.artists.join(', ')}
              {spotifyTrack.album?.name && (
                <span className="opacity-75"> • {spotifyTrack.album.name}</span>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            No match found
          </div>
        )}
      </div>

      {/* Confidence indicator */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className={cn('flex items-center gap-1', config.color)}>
          <Icon className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">{config.label}</span>
        </div>
        {score > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {score}%
          </span>
        )}
      </div>

      {/* Source link */}
      {imported.sourceUrl && (
        <a
          href={imported.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="View on Last.fm"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

/**
 * Format a Unix timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString();
}

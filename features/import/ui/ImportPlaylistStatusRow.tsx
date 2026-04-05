'use client';

import { Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImportJobData } from '@/features/import/hooks/useImportJob';

type PlaylistImportEntry = ImportJobData['playlists'][number];

interface SelectionRowProps {
  playlist: { id: string; name: string; tracksTotal: number };
  isSelected: boolean;
  onToggle: (id: string) => void;
  hasDuplicate: boolean;
}

interface ProgressRowProps {
  entry: PlaylistImportEntry;
}

type StatusStyle = {
  label: string;
  icon: React.ReactNode;
  className: string;
};

const STATUS_CONFIG: Record<PlaylistImportEntry['status'], StatusStyle> = {
  queued: {
    label: 'Queued',
    icon: null,
    className: 'bg-muted text-muted-foreground',
  },
  creating: {
    label: 'Creating',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  resolving_tracks: {
    label: 'Resolving',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  adding_tracks: {
    label: 'Adding',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  done: {
    label: 'Done',
    icon: <Check className="h-3 w-3" />,
    className: 'bg-green-500/15 text-green-600 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    icon: <X className="h-3 w-3" />,
    className: 'bg-destructive/15 text-destructive',
  },
  partial: {
    label: 'Partial',
    icon: <AlertTriangle className="h-3 w-3" />,
    className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  },
};

function StatusBadge({ status }: { status: PlaylistImportEntry['status'] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function TrackStats({ entry }: { entry: PlaylistImportEntry }) {
  if (entry.status === 'resolving_tracks') {
    return (
      <span className="text-xs text-muted-foreground">
        {entry.tracksResolved}/{entry.trackCount} tracks matched
      </span>
    );
  }

  if (entry.status === 'done' || entry.status === 'partial') {
    const parts: string[] = [];
    parts.push(`${entry.tracksAdded} tracks added`);
    if (entry.tracksUnresolved > 0) {
      parts.push(`${entry.tracksUnresolved} unresolved`);
    }
    return (
      <span className="text-xs text-muted-foreground">{parts.join(', ')}</span>
    );
  }

  if (entry.status === 'failed' && entry.errorMessage) {
    return (
      <span className="text-xs text-destructive truncate" title={entry.errorMessage}>
        {entry.errorMessage}
      </span>
    );
  }

  return null;
}

export function ImportPlaylistSelectionRow({
  playlist,
  isSelected,
  onToggle,
  hasDuplicate,
}: SelectionRowProps) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 cursor-pointer">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(playlist.id)}
        className="h-4 w-4 rounded border-input shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm truncate">{playlist.name}</span>
          {hasDuplicate && (
            <span title="A playlist with this name already exists on the target provider">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {playlist.tracksTotal} {playlist.tracksTotal === 1 ? 'track' : 'tracks'}
        </span>
      </div>
    </label>
  );
}

export function ImportPlaylistProgressRow({ entry }: ProgressRowProps) {
  const playlistName = entry.sourcePlaylistName?.trim() || 'Unnamed playlist';

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate" title={playlistName}>{playlistName}</span>
          <StatusBadge status={entry.status} />
        </div>
        <TrackStats entry={entry} />
      </div>
    </div>
  );
}

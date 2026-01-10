/**
 * EmptyTrackList - Renders the empty state when a playlist has no matching tracks.
 *
 * Shows different messages for:
 * - Search with no results
 * - Empty playlist
 */

'use client';

interface EmptyTrackListProps {
  /** Current search query (if any) */
  searchQuery: string;
}

export function EmptyTrackList({ searchQuery }: EmptyTrackListProps) {
  return (
    <div className="p-4 text-center text-muted-foreground">
      {searchQuery ? 'No tracks match your search' : 'This playlist is empty'}
    </div>
  );
}

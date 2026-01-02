/**
 * LastfmImportDialog - Modal for importing tracks from Last.fm profiles
 * 
 * Allows users to:
 * - Enter a Last.fm username
 * - Select import source (Recent, Loved, Top, Weekly)
 * - Preview and match tracks
 * - Add matched tracks to the current playlist
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/client';
import { LastfmResultList } from './LastfmResultList';
import type { ImportedTrackDTO, MatchResult, ImportSource, LastfmPeriod } from '@/lib/importers/types';

interface LastfmImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  playlistName?: string;
  onAddTracks: (trackUris: string[]) => Promise<void>;
}

type ImportSourceOption = {
  value: ImportSource;
  label: string;
  description: string;
};

const SOURCE_OPTIONS: ImportSourceOption[] = [
  { value: 'lastfm-recent', label: 'Recent', description: 'Recently played tracks' },
  { value: 'lastfm-loved', label: 'Loved', description: 'Tracks you\'ve loved' },
  { value: 'lastfm-top', label: 'Top', description: 'Most played tracks' },
  { value: 'lastfm-weekly', label: 'Weekly', description: 'This week\'s chart' },
];

const PERIOD_OPTIONS: { value: LastfmPeriod; label: string }[] = [
  { value: '7day', label: 'Last 7 days' },
  { value: '1month', label: 'Last month' },
  { value: '3month', label: 'Last 3 months' },
  { value: '6month', label: 'Last 6 months' },
  { value: '12month', label: 'Last year' },
  { value: 'overall', label: 'All time' },
];

const LIMIT_OPTIONS = [25, 50, 100];

interface LastfmResponse {
  enabled: boolean;
  tracks: ImportedTrackDTO[];
  pagination: {
    page: number;
    perPage: number;
    totalPages?: number;
    totalItems?: number;
  };
  source: ImportSource;
  period?: LastfmPeriod;
  error?: string;
}

interface MatchResponse {
  results: MatchResult[];
  matched: number;
  total: number;
}

export function LastfmImportDialog({
  open,
  onOpenChange,
  playlistId,
  playlistName,
  onAddTracks,
}: LastfmImportDialogProps) {
  const queryClient = useQueryClient();
  
  // Form state
  const [username, setUsername] = useState('');
  const [source, setSource] = useState<ImportSource>('lastfm-recent');
  const [period, setPeriod] = useState<LastfmPeriod>('3month');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [autoMatch, setAutoMatch] = useState(true);
  
  // Selection state
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [hasFetched, setHasFetched] = useState(false);
  
  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ success: number; failed: number } | null>(null);

  // Build query key
  const queryKey = ['lastfm', source, username, page, limit, period];

  // Fetch Last.fm tracks
  const {
    data: lastfmData,
    isLoading: isFetchingLastfm,
    error: lastfmError,
    refetch: fetchLastfm,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const endpoint = source.replace('lastfm-', '');
      const params = new URLSearchParams({
        user: username.trim().toLowerCase(),
        page: String(page),
        limit: String(limit),
      });
      
      if (source === 'lastfm-top') {
        params.set('period', period);
      }
      
      const response = await apiFetch<LastfmResponse>(`/api/lastfm/${endpoint}?${params}`);
      return response;
    },
    enabled: false, // Manual trigger only
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    retry: 1,
  });

  // Match tracks to Spotify
  const matchMutation = useMutation({
    mutationFn: async (tracks: ImportedTrackDTO[]) => {
      const response = await apiFetch<MatchResponse>('/api/lastfm/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, limit: 5 }),
      });
      return response;
    },
  });

  // Handle fetch button click
  const handleFetch = useCallback(async () => {
    if (!username.trim()) return;
    
    setHasFetched(true);
    setSelectedUris(new Set());
    setAddResult(null);
    
    const result = await fetchLastfm();
    
    // Auto-match if enabled and we have tracks
    if (result.data?.tracks && result.data.tracks.length > 0) {
      matchMutation.mutate(result.data.tracks);
    }
  }, [username, fetchLastfm, matchMutation]);

  // Handle page navigation
  const handlePageChange = useCallback(async (newPage: number) => {
    setPage(newPage);
    setSelectedUris(new Set());
    
    // Wait for state update then refetch
    setTimeout(async () => {
      const result = await fetchLastfm();
      if (result.data?.tracks && result.data.tracks.length > 0) {
        matchMutation.mutate(result.data.tracks);
      }
    }, 0);
  }, [fetchLastfm, matchMutation]);

  // Handle track selection toggle
  const handleToggleSelect = useCallback((uri: string) => {
    setSelectedUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  }, []);

  // Handle select all matched
  const handleSelectAllMatched = useCallback(() => {
    if (!matchMutation.data?.results) return;
    
    const matchedUris = new Set<string>();
    for (const result of matchMutation.data.results) {
      if (result.spotifyTrack && (autoMatch ? result.confidence === 'high' : result.confidence !== 'none')) {
        matchedUris.add(result.spotifyTrack.uri);
      }
    }
    setSelectedUris(matchedUris);
  }, [matchMutation.data, autoMatch]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedUris(new Set());
  }, []);

  // Handle add selected tracks
  const handleAddSelected = useCallback(async () => {
    if (selectedUris.size === 0) return;
    
    setIsAdding(true);
    setAddResult(null);
    
    try {
      const urisToAdd = Array.from(selectedUris);
      await onAddTracks(urisToAdd);
      
      setAddResult({ success: urisToAdd.length, failed: 0 });
      setSelectedUris(new Set());
      
      // Invalidate playlist queries
      queryClient.invalidateQueries({ queryKey: ['playlist-tracks-infinite', playlistId] });
    } catch (error) {
      console.error('[LastfmImport] Failed to add tracks:', error);
      setAddResult({ success: 0, failed: selectedUris.size });
    } finally {
      setIsAdding(false);
    }
  }, [selectedUris, onAddTracks, playlistId, queryClient]);

  // Reset state when dialog closes
  // Note: matchMutation.reset is stable and doesn't need to be in deps
  useEffect(() => {
    if (!open) {
      setHasFetched(false);
      setSelectedUris(new Set());
      setAddResult(null);
      setPage(1);
      matchMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select high-confidence matches when auto-match is enabled
  // Note: We intentionally omit handleSelectAllMatched from deps to avoid infinite loop.
  // The function is stable and only depends on matchMutation.data which is already in deps.
  useEffect(() => {
    if (autoMatch && matchMutation.data?.results) {
      // Inline the selection logic to avoid dependency cycle
      const matchedUris = new Set<string>();
      for (const result of matchMutation.data.results) {
        if (result.spotifyTrack && result.confidence === 'high') {
          matchedUris.add(result.spotifyTrack.uri);
        }
      }
      setSelectedUris(matchedUris);
    }
  }, [autoMatch, matchMutation.data]);

  const pagination = lastfmData?.pagination;
  const hasNextPage = pagination?.totalPages ? page < pagination.totalPages : false;
  const hasPrevPage = page > 1;

  const isLoading = isFetchingLastfm || matchMutation.isPending;
  const error = lastfmError || (lastfmData?.error ? new Error(lastfmData.error) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import from Last.fm
          </DialogTitle>
          <DialogDescription>
            Import tracks from a public Last.fm profile into{' '}
            <span className="font-medium text-foreground">{playlistName || 'your playlist'}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Configuration Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Username Input */}
          <div className="space-y-2">
            <Label htmlFor="lastfm-username">Last.fm Username</Label>
            <Input
              id="lastfm-username"
              placeholder="Enter username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && username.trim()) {
                  handleFetch();
                }
              }}
            />
          </div>

          {/* Source Selection */}
          <div className="space-y-2">
            <Label>Source</Label>
            <div className="flex gap-1">
              {SOURCE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={source === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSource(opt.value);
                    setPage(1);
                  }}
                  title={opt.description}
                  className="flex-1"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Period Selection (for Top tracks) */}
          {source === 'lastfm-top' && (
            <div className="space-y-2">
              <Label>Period</Label>
              <div className="flex flex-wrap gap-1">
                {PERIOD_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={period === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPeriod(opt.value)}
                    className="text-xs"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Limit Selection */}
          <div className="space-y-2">
            <Label>Tracks per page</Label>
            <div className="flex gap-1">
              {LIMIT_OPTIONS.map((opt) => (
                <Button
                  key={opt}
                  variant={limit === opt ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLimit(opt)}
                  className="flex-1"
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>

          {/* Auto-match Toggle */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-match"
                checked={autoMatch}
                onChange={(e) => setAutoMatch(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="auto-match" className="cursor-pointer">
                Auto-select high-confidence matches
              </Label>
            </div>
          </div>
        </div>

        {/* Fetch Button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleFetch}
            disabled={!username.trim() || isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isFetchingLastfm ? 'Fetching...' : 'Matching...'}
              </>
            ) : (
              <>Fetch Tracks</>
            )}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error.message}</span>
          </div>
        )}

        {/* Results List */}
        {hasFetched && !error && matchMutation.data?.results && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {/* Stats Bar */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>{matchMutation.data.results.length} tracks</span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  {matchMutation.data.results.filter((r: MatchResult) => r.confidence === 'high').length} matched
                </span>
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5 text-yellow-500" />
                  {matchMutation.data.results.filter((r: MatchResult) => r.confidence === 'medium' || r.confidence === 'low').length} review
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  {matchMutation.data.results.filter((r: MatchResult) => r.confidence === 'none').length} not found
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllMatched}
                  disabled={isLoading}
                >
                  Select matched
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={selectedUris.size === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto border rounded-md">
              <LastfmResultList
                results={matchMutation.data.results}
                selectedUris={selectedUris}
                onToggleSelect={handleToggleSelect}
              />
            </div>

            {/* Pagination */}
            {pagination && (pagination.totalPages ?? 0) > 1 && (
              <div className="flex items-center justify-between text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={!hasPrevPage || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {page} of {pagination.totalPages || '?'}
                  {pagination.totalItems && ` (${pagination.totalItems} total)`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={!hasNextPage || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Add Result Message */}
        {addResult && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-md text-sm',
              addResult.success > 0 ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'
            )}
          >
            {addResult.success > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Added {addResult.success} track{addResult.success !== 1 ? 's' : ''} to playlist
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                Failed to add tracks
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selectedUris.size} track{selectedUris.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={selectedUris.size === 0 || isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add {selectedUris.size} Track{selectedUris.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

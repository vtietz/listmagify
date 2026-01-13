'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Music, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TopTrack } from '../types';

interface TopTracksCardProps {
  topTracks?: TopTrack[];
  totalTracks?: number;
  isLoading: boolean;
}

export function TopTracksCard({ topTracks = [], totalTracks = 0, isLoading }: TopTracksCardProps) {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  
  const displayTracks = topTracks.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(totalTracks / pageSize);
  const maxEdges = Math.max(...topTracks.map(t => t.edgeCount), 1);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-4 w-4" />
            Top Tracks (by connections)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-4 w-4" />
          Top Tracks (by connections)
        </CardTitle>
        <CardDescription>
          Most connected tracks in the recommendation graph
        </CardDescription>
      </CardHeader>
      <CardContent>
        {displayTracks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No tracks indexed yet
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {displayTracks.map((track, i) => {
                const displayName = track.artist 
                  ? `${track.name} — ${track.artist}`
                  : track.name;
                return (
                  <div key={track.trackId} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{page * pageSize + i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="bg-green-500/20 rounded h-6 flex items-center px-2"
                        style={{ width: `${Math.max(20, (track.edgeCount / maxEdges) * 100)}%` }}
                      >
                        <span className="text-xs truncate" title={displayName}>{displayName}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-16 text-right">
                      {track.edgeCount} edges
                    </span>
                  </div>
                );
              })}
            </div>
            
            {totalPages > 1 && topTracks.length > pageSize && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, topTracks.length)} of {topTracks.length}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * pageSize >= topTracks.length}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

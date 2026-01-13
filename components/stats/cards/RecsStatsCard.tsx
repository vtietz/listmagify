'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sparkles, Music, GitBranch, Database, BarChart3 } from 'lucide-react';
import type { RecsStats } from '../types';

interface RecsStatsCardProps {
  data?: RecsStats;
  isLoading: boolean;
}

export function RecsStatsCard({ data, isLoading }: RecsStatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">Not Enabled</p>
            <p className="text-sm mt-1">Set RECS_ENABLED=true to enable the recommendation system</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = data.stats;
  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Recommendations System
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">No stats available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Recommendations System
        </CardTitle>
        <CardDescription>
          Graph-based recommendation engine statistics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Music className="h-3 w-3" />
              Tracks Indexed
            </div>
            <div className="text-2xl font-bold">{stats.tracks.toLocaleString()}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              Total Edges
            </div>
            <div className="text-2xl font-bold">{stats.totalEdges.toLocaleString()}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              DB Size
            </div>
            <div className="text-2xl font-bold">{stats.dbSizeMB} MB</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              Dismissed
            </div>
            <div className="text-2xl font-bold">{stats.dismissedRecommendations.toLocaleString()}</div>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="text-sm font-medium mb-3">Edge Breakdown</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Sequential</div>
              <div className="font-medium">{stats.seqEdges.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Co-occurrence</div>
              <div className="font-medium">{stats.cooccurEdges.toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        {stats.tracks === 0 && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">No data yet</p>
            <p className="text-muted-foreground mt-1">
              Open playlists in the Split Editor to start building the recommendation graph. 
              Recommendations will appear based on your playlist organization patterns.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

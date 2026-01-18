'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MessageSquarePlus, ThumbsUp, ThumbsDown, Users } from 'lucide-react';
import type { DateRange, FeedbackStats, FeedbackEntry } from '../types';

interface FeedbackStatsCardProps {
  dateRange: DateRange;
  isLoading: boolean;
}

export function FeedbackStatsCard({ dateRange, isLoading }: FeedbackStatsCardProps) {
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data: feedbackData, isLoading: feedbackLoading } = useQuery<{ data: FeedbackStats }>({
    queryKey: ['stats', 'feedback', dateRangeKey],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const res = await fetch(`/api/feedback?from=${dateRange.from}&to=${dateRange.to}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch feedback');
      return res.json();
    },
    refetchOnMount: true,
  });

  const loading = isLoading || feedbackLoading;
  const stats = feedbackData?.data;

  const getNpsColor = (nps: number) => {
    if (nps >= 50) return 'text-green-500';
    if (nps >= 0) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getNpsBgColor = (nps: number) => {
    if (nps >= 50) return 'bg-green-500/10';
    if (nps >= 0) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          User Feedback (NPS)
        </CardTitle>
        <CardDescription>
          Net Promoter Score and user comments for the selected period
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading...
          </div>
        ) : !stats || stats.totalResponses === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquarePlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No feedback received in this period</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`p-4 rounded-lg ${getNpsBgColor(stats.nps)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Net Promoter Score</div>
                  <div className={`text-4xl font-bold ${getNpsColor(stats.nps)}`}>
                    {stats.nps > 0 ? '+' : ''}{stats.nps}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Average Rating</div>
                  <div className="text-2xl font-bold">{stats.averageScore}/10</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <ThumbsUp className="h-4 w-4 mx-auto mb-1 text-green-500" />
                <div className="text-lg font-bold text-green-500">{stats.promoters}</div>
                <div className="text-xs text-muted-foreground">Promoters (9-10)</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                <div className="h-4 w-4 mx-auto mb-1 rounded-full bg-yellow-500/50" />
                <div className="text-lg font-bold text-yellow-500">{stats.passives}</div>
                <div className="text-xs text-muted-foreground">Passives (7-8)</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <ThumbsDown className="h-4 w-4 mx-auto mb-1 text-red-500" />
                <div className="text-lg font-bold text-red-500">{stats.detractors}</div>
                <div className="text-xs text-muted-foreground">Detractors (0-6)</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {stats.totalResponses} total response{stats.totalResponses !== 1 ? 's' : ''}
            </div>

            {stats.recentFeedback.some((f: FeedbackEntry) => f.comment) && (
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-3">Recent Comments</div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {stats.recentFeedback
                    .filter((f: FeedbackEntry) => f.comment)
                    .slice(0, 5)
                    .map((feedback: FeedbackEntry) => (
                      <div 
                        key={feedback.id} 
                        className="p-3 bg-muted/50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {typeof feedback.npsScore === 'number' ? (
                            <span className={`font-medium ${
                              feedback.npsScore >= 9 ? 'text-green-500' :
                              feedback.npsScore >= 7 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {feedback.npsScore}/10
                            </span>
                          ) : (
                            <span className="font-medium text-muted-foreground">No score</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(feedback.ts).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{feedback.comment}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

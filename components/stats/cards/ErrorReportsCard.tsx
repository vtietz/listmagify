'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ErrorReportDetailsDialog } from '../dialogs/ErrorReportDetailsDialog';
import { cn } from '@/lib/utils';
import type { ErrorReport, ErrorReportsResponse } from '../types';

interface ErrorReportsCardProps {
  dateRange: { from: string; to: string };
}

export function ErrorReportsCard({ dateRange }: ErrorReportsCardProps) {
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;
  const dateRangeKey = `${dateRange.from}_${dateRange.to}`;

  const { data, isLoading, refetch } = useQuery<ErrorReportsResponse>({
    queryKey: ['stats', 'error-reports', dateRangeKey, page, filter, searchQuery],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const offset = page * pageSize;
      const params = new URLSearchParams({
        from: dateRange.from,
        to: dateRange.to,
        limit: String(pageSize),
        offset: String(offset),
        ...(filter !== 'all' && { resolved: String(filter === 'resolved') }),
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(`/api/stats/error-reports?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch error reports');
      return res.json();
    },
    refetchOnMount: true,
  });

  const reports = data?.data ?? [];
  const pagination = data?.pagination;
  const unresolvedCount = reports.filter((r: ErrorReport) => !r.resolved).length;

  const handleMarkResolved = async (reportId: string, resolved: boolean) => {
    try {
      const res = await fetch('/api/stats/error-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, resolved }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to update error report:', error);
    }
  };

  const handleResolveAll = async () => {
    if (!confirm('Mark all unresolved errors as resolved?')) return;
    
    try {
      const res = await fetch('/api/stats/error-reports/resolve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          from: dateRange.from, 
          to: dateRange.to 
        }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to resolve all errors:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      rate_limit: 'bg-yellow-100 text-yellow-800',
      auth: 'bg-red-100 text-red-800',
      network: 'bg-blue-100 text-blue-800',
      api: 'bg-purple-100 text-purple-800',
      validation: 'bg-orange-100 text-orange-800',
      unknown: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || colors.unknown;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Error Reports
                {unresolvedCount > 0 && (
                  <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded">
                    {unresolvedCount} unresolved
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                User-submitted error reports from the application
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search errors..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9 h-8 w-48"
                />
              </div>
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('all'); setPage(0); }}
                  className="h-8"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'unresolved' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('unresolved'); setPage(0); }}
                  className="h-8"
                >
                  Unresolved
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'resolved' ? 'default' : 'ghost'}
                  onClick={() => { setFilter('resolved'); setPage(0); }}
                  className="h-8"
                >
                  Resolved
                </Button>
              </div>
              {unresolvedCount > 0 && filter !== 'resolved' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResolveAll}
                  className="h-8"
                >
                  Resolve All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No error reports in this period</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report: ErrorReport) => (
                <div
                  key={report.id}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors",
                    report.resolved ? 'opacity-60' : ''
                  )}
                  onClick={() => {
                    setSelectedReport(report);
                    setShowDetailsDialog(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          getCategoryBadge(report.error_category)
                        )}>
                          {report.error_category}
                        </span>
                        <span className={cn("text-xs font-medium", getSeverityColor(report.error_severity))}>
                          {report.error_severity}
                        </span>
                        {report.resolved ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : null}
                      </div>
                      <p className="text-sm font-medium truncate">{report.error_message}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(report.ts).toLocaleString()}</span>
                        <span>{report.user_name || 'Anonymous'}</span>
                        <span className="truncate">{report.report_id}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkResolved(report.report_id, !report.resolved);
                      }}
                    >
                      {report.resolved ? 'Unresolve' : 'Resolve'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {pagination && pagination.total > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {pagination.offset + 1}-{Math.min(pagination.offset + pageSize, pagination.total)} of {pagination.total}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!pagination.hasMore}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showDetailsDialog && selectedReport && (
        <ErrorReportDetailsDialog
          report={selectedReport}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          onMarkResolved={handleMarkResolved}
        />
      )}
    </>
  );
}

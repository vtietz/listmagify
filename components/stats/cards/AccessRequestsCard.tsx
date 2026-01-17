'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UserPlus, Mail } from 'lucide-react';
import { AccessRequestDetailsDialog } from '../dialogs/AccessRequestDetailsDialog';
import { cn } from '@/lib/utils';
import type { AccessRequest, AccessRequestsResponse } from '../types';

interface AccessRequestsCardProps {
  dateRange: { from: string; to: string };
}

export function AccessRequestsCard({ dateRange }: AccessRequestsCardProps) {
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery<AccessRequestsResponse>({
    queryKey: ['stats', 'access-requests', dateRange],
    queryFn: async () => {
      const res = await fetch(
        `/api/stats/access-requests?from=${dateRange.from}&to=${dateRange.to}&limit=10`
      );
      if (!res.ok) throw new Error('Failed to fetch access requests');
      return res.json();
    },
  });

  const requests = data?.data ?? [];
  const pendingCount = requests.filter((r: AccessRequest) => r.status === 'pending').length;

  const handleUpdateStatus = async (id: number, status: string, notes?: string) => {
    try {
      const res = await fetch('/api/stats/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, notes }),
      });
      if (res.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to update access request:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Access Requests
            {pendingCount > 0 && (
              <span className="ml-auto text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                {pendingCount} pending
              </span>
            )}
          </CardTitle>
          <CardDescription>
            User access requests from the landing page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No access requests in this period</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((request: AccessRequest) => (
                <div
                  key={request.id}
                  className="p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowDetailsDialog(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", getStatusColor(request.status))}>
                          {request.status}
                        </span>
                        <Mail className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">{request.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(request.ts).toLocaleDateString()}</span>
                        <span className="truncate">{request.email}</span>
                        {request.spotify_username && <span className="truncate">@{request.spotify_username}</span>}
                      </div>
                      {request.motivation && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{request.motivation}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showDetailsDialog && selectedRequest && (
        <AccessRequestDetailsDialog
          request={selectedRequest}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </>
  );
}

'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Mail, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccessRequest } from '../types';

interface AccessRequestDetailsDialogProps {
  request: AccessRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: number, status: string, notes?: string) => Promise<void>;
}

export function AccessRequestDetailsDialog({
  request,
  open,
  onOpenChange,
  onUpdateStatus,
}: AccessRequestDetailsDialogProps) {
  if (!open) return null;

  const redFlags = request.red_flags ? JSON.parse(request.red_flags) as string[] : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" 
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-background rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-2xl font-bold">Access Request Details</h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>✕</Button>
          </div>
          
          <div className="space-y-4">
            {redFlags.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 border-2 border-red-500 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                      Suspicious Patterns Detected
                    </h3>
                    <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
                      {redFlags.map((flag, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">•</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-muted-foreground">Timestamp</div>
              <div>{new Date(request.ts).toLocaleString()}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Name</div>
              <div className="font-medium">{request.name}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">Email</div>
              <div className="font-mono text-sm flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {request.email}
              </div>
            </div>

            {request.spotify_username && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Spotify Username</div>
                <div className="font-medium">{request.spotify_username}</div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-medium mt-1", getStatusColor(request.status))}>
                {request.status}
              </span>
            </div>

            {request.motivation && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Motivation</div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 rounded text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                  {request.motivation}
                </div>
              </div>
            )}

            {request.notes && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">Admin Notes</div>
                <div className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">{request.notes}</div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              {request.status === 'pending' && (
                <>
                  <Button
                    onClick={() => {
                      onUpdateStatus(request.id, 'approved');
                      onOpenChange(false);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => {
                      onUpdateStatus(request.id, 'rejected');
                      onOpenChange(false);
                    }}
                    variant="destructive"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

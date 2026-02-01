'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, User, Mail, Calendar, Activity, Plus, Minus, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface UserDetailDialogProps {
  userId: string | null;
  userHash: string;
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  lastActive: string;
  firstLoginAt: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserProfile {
  id: string;
  displayName: string | null;
  email?: string | null;
  external_urls?: {
    spotify?: string;
  };
  images?: Array<{ url: string }>;
  followers?: {
    total: number;
  };
}

export function UserDetailDialog({
  userId,
  userHash,
  eventCount,
  tracksAdded,
  tracksRemoved,
  lastActive,
  firstLoginAt,
  open,
  onOpenChange,
}: UserDetailDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch user profile from Spotify API on-demand
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch('/api/stats/user-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [userId] }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.[0] as UserProfile | null;
    },
    enabled: open && !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const profile = profileData;
  const displayName = profile?.displayName || userId || 'Unknown User';
  const spotifyUrl = profile?.external_urls?.spotify;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details
          </DialogTitle>
          <DialogDescription>
            Activity and profile information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Profile Info */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="py-4 text-center text-muted-foreground">
                Loading profile...
              </div>
            ) : (
              <>
                {/* Display Name */}
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Display Name</div>
                    <div className="font-medium break-words">{displayName}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => copyToClipboard(displayName, 'displayName')}
                    title="Copy display name"
                  >
                    {copiedField === 'displayName' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* User ID (if available) */}
                {userId && (
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">User ID</div>
                      <div className="font-mono text-xs break-all text-muted-foreground">{userId}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => copyToClipboard(userId, 'userId')}
                      title="Copy user ID"
                    >
                      {copiedField === 'userId' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}

                {/* Spotify Profile Link */}
                {spotifyUrl && (
                  <div className="flex items-start gap-3">
                    <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Spotify Profile</div>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-primary"
                        onClick={() => window.open(spotifyUrl, '_blank')}
                      >
                        Open in Spotify
                      </Button>
                    </div>
                  </div>
                )}

                {/* Email (if available) */}
                {profile?.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Email</div>
                      <div className="font-medium break-words">{profile.email}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => copyToClipboard(profile.email!, 'email')}
                      title="Copy email"
                    >
                      {copiedField === 'email' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* User Hash (for admin reference) */}
            <div className="flex items-start gap-3">
              <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">User Hash</div>
                <div className="font-mono text-xs break-all text-muted-foreground">
                  {userHash}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => copyToClipboard(userHash, 'userHash')}
                title="Copy user hash"
              >
                {copiedField === 'userHash' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Activity Stats */}
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-3">Activity Statistics</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Activity className="h-3 w-3" />
                  Total Events
                </div>
                <div className="text-xl font-bold">{eventCount}</div>
              </div>

              <div className="p-3 bg-green-500/10 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Plus className="h-3 w-3 text-green-600" />
                  Tracks Added
                </div>
                <div className="text-xl font-bold text-green-600">{tracksAdded}</div>
              </div>

              <div className="p-3 bg-red-500/10 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Minus className="h-3 w-3 text-red-600" />
                  Tracks Removed
                </div>
                <div className="text-xl font-bold text-red-600">{tracksRemoved}</div>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3 w-3" />
                  Last Active
                </div>
                <div className="text-sm font-medium">
                  {new Date(lastActive).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* First Login Date */}
            {firstLoginAt && (
              <div className="mt-3 p-3 bg-blue-500/10 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3 w-3 text-blue-600" />
                  First Login
                </div>
                <div className="text-sm font-medium text-blue-600">
                  {new Date(firstLoginAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

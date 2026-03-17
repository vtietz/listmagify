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

function formatDate(value: string | null): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toISOString().slice(0, 10);
}

function CopyActionButton({
  copiedField,
  fieldName,
  onCopy,
  text,
  title,
}: {
  copiedField: string | null;
  fieldName: string;
  onCopy: (text: string, fieldName: string) => void;
  text: string;
  title: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 shrink-0"
      onClick={() => onCopy(text, fieldName)}
      title={title}
    >
      {copiedField === fieldName ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}

function DisplayNameRow({
  displayName,
  copiedField,
  onCopy,
}: {
  displayName: string;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">Display Name</div>
        <div className="font-medium break-words">{displayName}</div>
      </div>
      <CopyActionButton
        copiedField={copiedField}
        fieldName="displayName"
        onCopy={onCopy}
        text={displayName}
        title="Copy display name"
      />
    </div>
  );
}

function UserIdRow({
  userId,
  copiedField,
  onCopy,
}: {
  userId: string | null;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}) {
  if (!userId) {
    return null;
  }

  return (
    <div className="flex items-start gap-3">
      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">User ID</div>
        <div className="font-mono text-xs break-all text-muted-foreground">{userId}</div>
      </div>
      <CopyActionButton
        copiedField={copiedField}
        fieldName="userId"
        onCopy={onCopy}
        text={userId}
        title="Copy user ID"
      />
    </div>
  );
}

function SpotifyProfileRow({ spotifyUrl }: { spotifyUrl: string | undefined }) {
  if (!spotifyUrl) {
    return null;
  }

  return (
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
  );
}

function EmailRow({
  email,
  copiedField,
  onCopy,
}: {
  email: string | null | undefined;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}) {
  if (!email) {
    return null;
  }

  return (
    <div className="flex items-start gap-3">
      <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">Email</div>
        <div className="font-medium break-words">{email}</div>
      </div>
      <CopyActionButton
        copiedField={copiedField}
        fieldName="email"
        onCopy={onCopy}
        text={email}
        title="Copy email"
      />
    </div>
  );
}

function UserHashRow({
  userHash,
  copiedField,
  onCopy,
}: {
  userHash: string;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">User Hash</div>
        <div className="font-mono text-xs break-all text-muted-foreground">{userHash}</div>
      </div>
      <CopyActionButton
        copiedField={copiedField}
        fieldName="userHash"
        onCopy={onCopy}
        text={userHash}
        title="Copy user hash"
      />
    </div>
  );
}

function ProfileSection({
  isLoading,
  displayName,
  userId,
  spotifyUrl,
  email,
  userHash,
  copiedField,
  onCopy,
}: {
  isLoading: boolean;
  displayName: string;
  userId: string | null;
  spotifyUrl: string | undefined;
  email: string | null | undefined;
  userHash: string;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}) {
  if (isLoading) {
    return <div className="py-4 text-center text-muted-foreground">Loading profile...</div>;
  }

  return (
    <>
      <DisplayNameRow displayName={displayName} copiedField={copiedField} onCopy={onCopy} />
      <UserIdRow userId={userId} copiedField={copiedField} onCopy={onCopy} />
      <SpotifyProfileRow spotifyUrl={spotifyUrl} />
      <EmailRow email={email} copiedField={copiedField} onCopy={onCopy} />
      <UserHashRow userHash={userHash} copiedField={copiedField} onCopy={onCopy} />
    </>
  );
}

function ActivityStatsSection({
  eventCount,
  tracksAdded,
  tracksRemoved,
  lastActive,
  firstLoginAt,
}: {
  eventCount: number;
  tracksAdded: number;
  tracksRemoved: number;
  lastActive: string;
  firstLoginAt: string | null;
}) {
  return (
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
          <div className="text-sm font-medium">{formatDate(lastActive)}</div>
        </div>
      </div>

      {firstLoginAt && (
        <div className="mt-3 p-3 bg-blue-500/10 rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar className="h-3 w-3 text-blue-600" />
            First Login
          </div>
          <div className="text-sm font-medium text-blue-600">{formatDate(firstLoginAt)}</div>
        </div>
      )}
    </div>
  );
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
          <div className="space-y-3">
            <ProfileSection
              isLoading={isLoading}
              displayName={displayName}
              userId={userId}
              spotifyUrl={spotifyUrl}
              email={profile?.email}
              userHash={userHash}
              copiedField={copiedField}
              onCopy={(text, fieldName) => {
                void copyToClipboard(text, fieldName);
              }}
            />
          </div>

          <ActivityStatsSection
            eventCount={eventCount}
            tracksAdded={tracksAdded}
            tracksRemoved={tracksRemoved}
            lastActive={lastActive}
            firstLoginAt={firstLoginAt}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

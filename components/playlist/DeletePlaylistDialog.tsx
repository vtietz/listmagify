"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { MusicProviderId } from "@/lib/music-provider/types";
import { useSyncPairs } from "@features/sync/hooks/useSyncPairs";
import type { SyncPairWithRun } from "@features/sync/hooks/useSyncPairs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeletePlaylistDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistName: string;
  playlistId: string;
  providerId: MusicProviderId;
  onConfirm: () => void;
  isDeleting: boolean;
};

function getOtherPlaylistName(pair: SyncPairWithRun, playlistId: string): string {
  return pair.sourcePlaylistId === playlistId
    ? (pair.targetPlaylistName || pair.targetPlaylistId)
    : (pair.sourcePlaylistName || pair.sourcePlaylistId);
}

function AffectedSyncPairs({ pairs, playlistId }: { pairs: SyncPairWithRun[]; playlistId: string }) {
  if (pairs.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">
        {pairs.length === 1 ? "1 sync pair" : `${pairs.length} sync pairs`} will also be removed:
      </p>
      <ul className="mt-1.5 space-y-1 text-muted-foreground">
        {pairs.map((pair) => (
          <li key={pair.id} className="flex items-center gap-1.5">
            <span className="text-xs">&#x2194;</span>
            <span className="truncate">{getOtherPlaylistName(pair, playlistId)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeletePlaylistDialog({
  open,
  onOpenChange,
  playlistName,
  playlistId,
  providerId,
  onConfirm,
  isDeleting,
}: DeletePlaylistDialogProps) {
  const { data: allPairs } = useSyncPairs(open);

  const affectedPairs = useMemo(() => {
    if (!allPairs) return [];
    return allPairs.filter(
      (pair: SyncPairWithRun) =>
        (pair.sourceProvider === providerId && pair.sourcePlaylistId === playlistId) ||
        (pair.targetProvider === providerId && pair.targetPlaylistId === playlistId),
    );
  }, [allPairs, providerId, playlistId]);

  const isTidal = providerId === "tidal";
  const title = isTidal ? "Delete Playlist" : "Remove Playlist";
  const description = isTidal
    ? `This will permanently delete "${playlistName}". This action cannot be undone.`
    : `This will remove "${playlistName}" from your library. You can re-follow it later.`;
  const confirmLabel = isTidal ? "Delete" : "Remove";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AffectedSyncPairs pairs={affectedPairs} playlistId={playlistId} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

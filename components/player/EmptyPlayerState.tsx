/**
 * EmptyPlayerState - Shows when no track is playing.
 */

'use client';

import { Loader2, MonitorSpeaker } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyPlayerStateProps {
  isWebPlayerReady: boolean;
  isWebPlayerInitializing: boolean;
  onDeviceClick: () => void;
}

export function EmptyPlayerState({
  isWebPlayerReady,
  isWebPlayerInitializing,
  onDeviceClick,
}: EmptyPlayerStateProps) {
  return (
    <div className="h-20 border-t border-border bg-background/95 backdrop-blur px-4 flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        {isWebPlayerInitializing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Initializing player...</span>
          </>
        ) : isWebPlayerReady ? (
          <>
            <MonitorSpeaker className="h-5 w-5 text-green-500" />
            <span className="text-sm">Ready to play</span>
          </>
        ) : (
          <>
            <MonitorSpeaker className="h-5 w-5" />
            <span className="text-sm">No active playback</span>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onDeviceClick}
          className="ml-2"
        >
          Select Device
        </Button>
      </div>
    </div>
  );
}

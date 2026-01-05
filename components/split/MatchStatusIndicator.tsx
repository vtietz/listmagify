/**
 * MatchStatusIndicator - Shows the match status of a Last.fm track
 */

import { Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { MatchStatus } from '@/hooks/useLastfmMatchCache';

interface MatchStatusIndicatorProps {
  status: MatchStatus;
}

export function MatchStatusIndicator({ status }: MatchStatusIndicatorProps) {
  switch (status) {
    case 'pending':
      return (
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-muted-foreground"
          aria-label="Matching..."
        />
      );
    case 'matched':
      return (
        <CheckCircle2
          className="h-3.5 w-3.5 text-green-500"
          aria-label="Matched"
        />
      );
    case 'failed':
      return (
        <XCircle
          className="h-3.5 w-3.5 text-red-500"
          aria-label="No match found"
        />
      );
    case 'idle':
    default:
      return (
        <Circle
          className="h-3.5 w-3.5 text-muted-foreground/50"
          aria-label="Not matched yet"
        />
      );
  }
}

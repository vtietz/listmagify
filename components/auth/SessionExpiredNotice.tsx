import { Clock } from "lucide-react";

/**
 * Notice shown when user's Spotify session has expired or been revoked.
 * Explains common reasons for session expiration with a friendly tone.
 */
export function SessionExpiredNotice() {
  return (
    <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 shrink-0">
          <Clock className="h-4 w-4 text-orange-500" />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-sm">Session Expired</h3>
          <p className="text-sm text-muted-foreground">
            Your Spotify session has expired or been revoked. This can happen if:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>You haven&apos;t used the app in a while</li>
            <li>You changed your Spotify password</li>
            <li>You revoked access in Spotify settings</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

type DevModeNoticeProps = {
  showRequestAccessHint?: boolean;
  showByokHint?: boolean;
};

/**
 * Notice explaining that the app is in Spotify development mode.
 * Optionally includes hint about requesting access.
 */
export function DevModeNotice({
  showRequestAccessHint = false,
  showByokHint = false,
}: DevModeNoticeProps) {
  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <p className="text-xs text-muted-foreground text-center">
        This app is currently in Spotify{' '}
        <a
          href="https://developer.spotify.com/documentation/web-api/concepts/quota-modes"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          development mode
        </a>{' '}
        and can only be used by a limited number of approved users.
        {showRequestAccessHint && " If you'd like to try it out, click \"Request Access\" above."}
        {showByokHint && " Alternatively, you can use your own Spotify API key to sign in without needing approval."}
      </p>
    </div>
  );
}

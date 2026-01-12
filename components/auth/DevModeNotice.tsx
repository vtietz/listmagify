type DevModeNoticeProps = {
  showRequestAccessHint?: boolean;
};

/**
 * Notice explaining that the app is in Spotify development mode.
 * Optionally includes hint about requesting access.
 */
export function DevModeNotice({ showRequestAccessHint = false }: DevModeNoticeProps) {
  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <p className="text-xs text-muted-foreground text-center">
        This app is currently in Spotify development mode and can only be used by a limited number of approved users.
        {showRequestAccessHint && " If you'd like to try it out, click \"Request Access\" above."}
      </p>
    </div>
  );
}

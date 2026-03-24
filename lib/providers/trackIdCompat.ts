import type { MusicProviderId } from '@/lib/music-provider/types';

const SPOTIFY_TRACK_ID_RE = /^[A-Za-z0-9]{15,30}$/;
const TIDAL_NUMERIC_ID_RE = /^[0-9]+$/;
const TIDAL_UUID_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTrackIdCompatibleWithProvider(
  trackId: string | null | undefined,
  providerId: MusicProviderId,
): boolean {
  if (!trackId) {
    return false;
  }

  if (trackId.startsWith('test-')) {
    return true;
  }

  if (providerId === 'spotify') {
    return SPOTIFY_TRACK_ID_RE.test(trackId);
  }

  if (providerId === 'tidal') {
    return TIDAL_NUMERIC_ID_RE.test(trackId) || TIDAL_UUID_ID_RE.test(trackId);
  }

  return true;
}

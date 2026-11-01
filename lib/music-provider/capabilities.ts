import type { MusicProviderId } from './types';

type ProviderCapabilities = {
  playbackControl: boolean;
  verifyLikedTracksAfterWrite: boolean;
  /** Whether reorderTracks moves entries in place instead of rewriting the playlist */
  inPlaceReorder: () => boolean;
};

const PROVIDER_CAPABILITIES: Record<MusicProviderId, ProviderCapabilities> = {
  spotify: {
    playbackControl: true,
    verifyLikedTracksAfterWrite: false,
    inPlaceReorder: () => true,
  },
  tidal: {
    playbackControl: false,
    verifyLikedTracksAfterWrite: false,
    // Same flag as the TIDAL adapter's native PATCH reorder; without it reorderTracks rewrites the playlist.
    inPlaceReorder: () => process.env.TIDAL_NATIVE_REORDER === '1',
  },
};

export function supportsProviderPlaybackControl(providerId: MusicProviderId): boolean {
  return PROVIDER_CAPABILITIES[providerId].playbackControl;
}

export function requiresLikedTracksVerification(providerId: MusicProviderId): boolean {
  return PROVIDER_CAPABILITIES[providerId].verifyLikedTracksAfterWrite;
}

export function supportsInPlaceReorder(providerId: MusicProviderId): boolean {
  return PROVIDER_CAPABILITIES[providerId].inPlaceReorder();
}

import type { MusicProviderId } from './types';

type ProviderCapabilities = {
  playbackControl: boolean;
  verifyLikedTracksAfterWrite: boolean;
};

const PROVIDER_CAPABILITIES: Record<MusicProviderId, ProviderCapabilities> = {
  spotify: {
    playbackControl: true,
    verifyLikedTracksAfterWrite: false,
  },
  tidal: {
    playbackControl: false,
    verifyLikedTracksAfterWrite: true,
  },
};

export function supportsProviderPlaybackControl(providerId: MusicProviderId): boolean {
  return PROVIDER_CAPABILITIES[providerId].playbackControl;
}

export function requiresLikedTracksVerification(providerId: MusicProviderId): boolean {
  return PROVIDER_CAPABILITIES[providerId].verifyLikedTracksAfterWrite;
}
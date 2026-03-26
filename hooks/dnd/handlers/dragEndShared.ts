import type { Track } from '@/lib/music-provider/types';
import type { MusicProviderId } from '@/lib/music-provider/types';
import type { PanelConfig, TrackPayload } from '../types';
import { getBrowsePanelDragPayloads, getBrowsePanelDragUris } from '../helpers';
import { useBrowsePanelStore } from '../../useBrowsePanelStore';
import { apiFetch } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { isPlaylistIdCompatibleWithProvider } from '@/lib/providers/playlistIdCompat';

export function inferProviderIdFromPlaylistId(playlistId: string | null | undefined): MusicProviderId | null {
  if (!playlistId) {
    return null;
  }

  if (isPlaylistIdCompatibleWithProvider(playlistId, 'tidal')) {
    return 'tidal';
  }

  if (isPlaylistIdCompatibleWithProvider(playlistId, 'spotify')) {
    return 'spotify';
  }

  return null;
}

export function resolvePanelProviderId(panel: PanelConfig, playlistId?: string | null): MusicProviderId {
  if (panel.providerId) {
    return panel.providerId;
  }

  const inferredProvider = inferProviderIdFromPlaylistId(playlistId ?? panel.playlistId);
  return inferredProvider ?? 'spotify';
}

function parseReleaseYear(releaseDate: string | null | undefined): number | undefined {
  if (!releaseDate) {
    return undefined;
  }

  const parsedYear = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(parsedYear) ? parsedYear : undefined;
}

function buildPayloadFromTrack(track: Track, sourceProvider: MusicProviderId): TrackPayload {
  const artists = track.artists ?? [];
  return {
    title: track.name,
    artists,
    normalizedArtists: artists.map((artist) => artist.trim().toLowerCase()),
    album: track.album?.name ?? null,
    durationSec: Math.max(0, Math.round((track.durationMs ?? 0) / 1000)),
    sourceProvider,
    sourceProviderId: track.id ?? undefined,
    sourceProviderUri: track.uri || undefined,
    coverUrl: track.album?.image?.url,
    year: parseReleaseYear(track.album?.releaseDate),
  };
}

type TrackSourceData = Record<string, unknown> & {
  type: 'track';
  panelId?: string;
  playlistId?: string;
  track: Track;
  position: number;
  trackPayload?: TrackPayload;
  selectedTrackPayloads?: TrackPayload[];
};

export function resolveCrossProviderPayloads(
  sourceData: TrackSourceData,
  dragTracks: Track[],
  sourceProvider: MusicProviderId,
): TrackPayload[] {
  if (sourceData.selectedTrackPayloads && sourceData.selectedTrackPayloads.length > 0) {
    return sourceData.selectedTrackPayloads;
  }

  if (dragTracks.length > 1) {
    return dragTracks.map((track) => buildPayloadFromTrack(track, sourceProvider));
  }

  if (sourceData.trackPayload) {
    return [sourceData.trackPayload];
  }

  return dragTracks.map((track) => buildPayloadFromTrack(track, sourceProvider));
}

export function handleLastfmTrackDrop(
  sourceData: { matchedTrack: Track; selectedMatchedUris?: string[] },
  targetPanelId: string,
  targetPlaylistId: string,
  targetProviderId: MusicProviderId,
  targetIndex: number,
  handler: (params: {
    matchedTrack: Track;
    selectedMatchedUris?: string[];
    targetPanelId: string;
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    targetIndex: number;
    clearSelection: () => void;
  }) => void,
): void {
  const handlerInput: {
    matchedTrack: Track;
    selectedMatchedUris?: string[];
    targetPanelId: string;
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    targetIndex: number;
    clearSelection: () => void;
  } = {
    matchedTrack: sourceData.matchedTrack,
    targetPanelId,
    targetPlaylistId,
    targetProviderId,
    targetIndex,
    clearSelection: useBrowsePanelStore.getState().clearLastfmSelection,
  };

  if (sourceData.selectedMatchedUris) {
    handlerInput.selectedMatchedUris = sourceData.selectedMatchedUris;
  }

  handler(handlerInput);
}

export async function handlePlayerDrop(
  sourceData: Record<string, unknown>,
  sourceTrack: Track,
): Promise<void> {
  const trackUris = getBrowsePanelDragUris(sourceData, sourceTrack);

  if (trackUris.length > 0) {
    try {
      await apiFetch<{ success?: boolean }>('/api/player/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'play',
          uris: trackUris,
        }),
      });

      const message = trackUris.length > 1
        ? `Playing ${trackUris.length} tracks`
        : `Playing "${sourceTrack?.name ?? 'tracks'}"`;
      toast.success(message);
    } catch (error) {
      console.error('[DND] Failed to play track:', error);
    }
  }
}

function resolveBrowseDropSourceProviderId(
  payloads: TrackPayload[],
  sourceData: Record<string, unknown>,
  panels: PanelConfig[],
): MusicProviderId | undefined {
  const sourcePanelId = typeof sourceData.panelId === 'string' ? sourceData.panelId : null;
  const sourcePanel = sourcePanelId
    ? panels.find((panel) => panel.id === sourcePanelId)
    : undefined;

  return payloads[0]?.sourceProvider ?? (sourcePanel ? resolvePanelProviderId(sourcePanel) : undefined);
}

function maybeEnqueueCrossProviderBrowseDrop(params: {
  enqueuePendingFromBrowseDrop: ((params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean) | undefined;
  payloads: TrackPayload[];
  sourceProviderId: MusicProviderId | undefined;
  targetProviderId: MusicProviderId;
  targetPlaylistId: string;
  targetIndex: number;
}): boolean {
  if (!params.enqueuePendingFromBrowseDrop || params.payloads.length === 0 || !params.sourceProviderId) {
    return false;
  }

  if (params.sourceProviderId === params.targetProviderId) {
    return false;
  }

  return params.enqueuePendingFromBrowseDrop({
    targetPlaylistId: params.targetPlaylistId,
    targetProviderId: params.targetProviderId,
    insertPosition: params.targetIndex,
    payloads: params.payloads,
  });
}

export function handleBrowsePanelCopyDrop(
  sourceData: Record<string, unknown>,
  targetData: Record<string, unknown>,
  sourceTrack: Track,
  targetPlaylistId: string,
  targetProviderId: MusicProviderId,
  panels: PanelConfig[],
  targetPanel: PanelConfig | undefined,
  finalDropPosition: number | null,
  addTracks: (input: { providerId: MusicProviderId; playlistId: string; trackUris: string[]; position: number }) => void,
  enqueuePendingFromBrowseDrop: ((params: {
    targetPlaylistId: string;
    targetProviderId: MusicProviderId;
    insertPosition: number;
    payloads: TrackPayload[];
  }) => boolean) | undefined,
): boolean {
  if (!targetPanel?.isEditable) {
    toast.error('Target playlist is not editable');
    return false;
  }

  const targetIndex = finalDropPosition ?? (targetData.position as number ?? 0);
  const payloads = getBrowsePanelDragPayloads(sourceData, sourceTrack);
  const sourceProviderId = resolveBrowseDropSourceProviderId(payloads, sourceData, panels);

  const pendingHandled = maybeEnqueueCrossProviderBrowseDrop({
    enqueuePendingFromBrowseDrop,
    payloads,
    sourceProviderId,
    targetProviderId,
    targetPlaylistId,
    targetIndex,
  });
  if (pendingHandled) {
    return true;
  }

  const trackUris = getBrowsePanelDragUris(sourceData, sourceTrack);

  if (trackUris.length === 0) {
    console.error('[DND] No track URIs to add');
    return false;
  }

  addTracks({
    providerId: targetProviderId,
    playlistId: targetPlaylistId,
    trackUris,
    position: targetIndex,
  });

  return true;
}

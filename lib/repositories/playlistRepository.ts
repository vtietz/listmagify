import { routeErrors } from '@/lib/errors';
import type { Playlist } from '@/lib/music-provider/types';

export function getPlaylistFieldsQuery(): string {
  return 'id,name,description,owner(id,display_name),collaborative,public,tracks(total)';
}

type PlaylistMetadataInput = Playlist & {
  owner?: {
    id?: string | null;
    display_name?: string | null;
    displayName?: string | null;
  } | null;
  tracks?: {
    total?: number;
  };
  public?: boolean | null;
};

function mapOwnerMetadata(owner: PlaylistMetadataInput['owner']) {
  return {
    id: owner?.id,
    displayName: owner?.displayName ?? owner?.display_name,
  };
}

function resolveTracksTotal(playlist: PlaylistMetadataInput): number {
  if (typeof playlist.tracksTotal === 'number') {
    return playlist.tracksTotal;
  }

  return playlist.tracks?.total ?? 0;
}

function resolvePublicState(playlist: PlaylistMetadataInput): boolean {
  if (typeof playlist.isPublic === 'boolean') {
    return playlist.isPublic;
  }

  return typeof playlist.public === 'boolean' ? playlist.public : false;
}

export function mapPlaylistMetadata(playlist: PlaylistMetadataInput) {
  if (!playlist?.id) {
    throw routeErrors.upstreamFailure('Invalid playlist payload from upstream provider');
  }

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    owner: mapOwnerMetadata(playlist.owner),
    collaborative: playlist.collaborative ?? false,
    tracksTotal: resolveTracksTotal(playlist),
    isPublic: resolvePublicState(playlist),
  };
}
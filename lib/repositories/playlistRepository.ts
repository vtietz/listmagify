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

export function mapPlaylistMetadata(playlist: PlaylistMetadataInput) {
  if (!playlist?.id) {
    throw routeErrors.upstreamFailure('Invalid playlist payload from upstream provider');
  }

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    owner: {
      id: playlist.owner?.id,
      displayName: playlist.owner?.displayName ?? playlist.owner?.display_name,
    },
    collaborative: playlist.collaborative ?? false,
    tracksTotal: playlist.tracksTotal ?? playlist.tracks?.total ?? 0,
    isPublic: typeof playlist.isPublic === 'boolean'
      ? playlist.isPublic
      : typeof playlist.public === 'boolean'
        ? playlist.public
        : false,
  };
}
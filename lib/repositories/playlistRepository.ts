import { routeErrors } from '@/lib/errors';

export function getPlaylistFieldsQuery(): string {
  return 'id,name,description,owner(id,display_name),collaborative,public,tracks(total)';
}

export function mapPlaylistMetadata(playlist: any) {
  if (!playlist?.id) {
    throw routeErrors.upstreamFailure('Invalid playlist payload from Spotify');
  }

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? '',
    owner: {
      id: playlist.owner?.id,
      displayName: playlist.owner?.display_name,
    },
    collaborative: playlist.collaborative ?? false,
    tracksTotal: playlist.tracks?.total ?? 0,
    isPublic: typeof playlist.public === 'boolean' ? playlist.public : false,
  };
}
export type ProviderClientOptions = {
  baseUrl?: string;
  backoff?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
};

// Provider-neutral domain types used by UI/state layers.
export type Image = {
  url: string;
  width?: number | null;
  height?: number | null;
};

export type Artist = {
  id: string | null;
  name: string;
};

export type Playlist = {
  id: string;
  name: string;
  description?: string | null;
  ownerName?: string | null;
  owner?: {
    id?: string | null;
    displayName?: string | null;
  } | null;
  image?: Image | null;
  tracksTotal: number;
  isPublic?: boolean | null;
  collaborative?: boolean | null;
};

export type Track = {
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  artistObjects?: Artist[];
  durationMs: number;
  addedAt?: string;
  position?: number;
  originalPosition?: number;
  album?: {
    id?: string | null;
    name?: string | null;
    image?: Image | null;
    releaseDate?: string | null;
    releaseDatePrecision?: 'year' | 'month' | 'day' | null;
  } | null;
  popularity?: number | null;
  explicit?: boolean;
  addedBy?: {
    id: string;
    displayName?: string | null;
  } | null;
};

export type PlaybackDeviceType =
  | 'Computer'
  | 'Smartphone'
  | 'Speaker'
  | 'TV'
  | 'AVR'
  | 'STB'
  | 'AudioDongle'
  | 'GameConsole'
  | 'CastVideo'
  | 'CastAudio'
  | 'Automobile'
  | 'Unknown';

export type PlaybackDevice = {
  id: string;
  name: string;
  type: PlaybackDeviceType;
  isActive: boolean;
  isPrivateSession: boolean;
  isRestricted: boolean;
  volumePercent: number | null;
  supportsVolume: boolean;
};

export type PlaybackContext = {
  type: 'album' | 'artist' | 'playlist' | 'show';
  uri: string;
  href: string;
};

export type PlaybackTrack = {
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  albumName: string | null;
  albumImage: string | null;
  durationMs: number;
};

export type PlaybackRestrictions = {
  pausing: boolean;
  resuming: boolean;
  seeking: boolean;
  skippingNext: boolean;
  skippingPrev: boolean;
  togglingShuffle: boolean;
  togglingRepeat: boolean;
  transferringPlayback: boolean;
};

export type PlaybackState = {
  device: PlaybackDevice | null;
  isPlaying: boolean;
  shuffleState: boolean;
  repeatState: 'off' | 'track' | 'context';
  context: PlaybackContext | null;
  track: PlaybackTrack | null;
  progressMs: number;
  timestamp: number;
  restrictions: PlaybackRestrictions;
};

export type MusicProviderId = 'spotify' | 'tidal';

export type TrackSavePayload = {
  ids: string[];
};

export type AddTracksPayload = {
  playlistId: string;
  trackUris: string[];
  position?: number;
  snapshotId?: string;
};

export type ReorderTracksPayload = {
  playlistId: string;
  fromIndex: number;
  toIndex: number;
  rangeLength?: number;
  snapshotId?: string;
};

export type PlaylistPageResult<TPlaylist> = {
  items: TPlaylist[];
  nextCursor: string | null;
  total: number;
};

export type PlaylistTracksPageResult<TTrack> = {
  tracks: TTrack[];
  snapshotId: string | null;
  total: number;
  nextCursor: string | null;
};

export type LikedTracksPageResult<TTrack> = {
  tracks: TTrack[];
  total: number;
  nextCursor: string | null;
};

export type TrackSearchResult<TTrack> = {
  tracks: TTrack[];
  total: number;
  nextOffset: number | null;
};

export type SearchArtistResult = {
  id: string;
  name: string;
  image: Image | null;
};

export type SearchAlbumResult = {
  id: string;
  name: string;
  artistName: string;
  image: Image | null;
  releaseDate?: string | null;
};

export type ArtistSearchResult = {
  artists: SearchArtistResult[];
  total: number;
  nextOffset: number | null;
};

export type AlbumSearchResult = {
  albums: SearchAlbumResult[];
  total: number;
  nextOffset: number | null;
};

export type SearchFilterType = 'all' | 'tracks' | 'artists' | 'albums';

export type PlaylistPermissionsResult = {
  ownerId: string | null;
  collaborative: boolean;
};

export type CurrentUserResult = {
  id: string;
  displayName: string | null;
  email?: string | null;
};

export type PublicUserProfileResult = {
  id: string;
  displayName: string | null;
  imageUrl: string | null;
  email?: string | null;
};

export type CreatePlaylistPayload = {
  userId: string;
  name: string;
  description: string;
  isPublic: boolean;
};

export type UpdatePlaylistPayload = {
  name?: string;
  description?: string;
  public?: boolean;
};

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly provider: MusicProviderId,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

export interface MusicProvider {
  saveTracks(payload: TrackSavePayload): Promise<void>;
  removeTracks(payload: TrackSavePayload): Promise<void>;
  containsTracks(payload: TrackSavePayload): Promise<boolean[]>;
  getLikedTracks(limit?: number, nextCursor?: string | null): Promise<LikedTracksPageResult<Track>>;
  searchTracks(query: string, limit?: number, offset?: number): Promise<TrackSearchResult<Track>>;
  searchArtists(query: string, limit?: number, offset?: number): Promise<ArtistSearchResult>;
  searchAlbums(query: string, limit?: number, offset?: number): Promise<AlbumSearchResult>;
  getArtistTopTracks(artistId: string): Promise<Track[]>;
  getAlbumTracks(albumId: string): Promise<Track[]>;
  getCurrentUser(): Promise<CurrentUserResult>;
  getUserProfile(userId: string): Promise<PublicUserProfileResult>;
  getPlaylistPermissions(playlistId: string): Promise<PlaylistPermissionsResult>;
  getPlaylistDetails(playlistId: string, fields?: string): Promise<Playlist>;
  createPlaylist(payload: CreatePlaylistPayload): Promise<Playlist>;
  updatePlaylistDetails(playlistId: string, payload: UpdatePlaylistPayload): Promise<void>;
  getPlaylistTrackUris(playlistId: string): Promise<string[]>;
  replacePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }>;
  removePlaylistTracks(playlistId: string, trackUris: string[]): Promise<{ snapshotId: string }>;
  getPlaybackState(): Promise<PlaybackState | null>;
  getPlaybackDevices(): Promise<PlaybackDevice[]>;
  addTracks(payload: AddTracksPayload): Promise<{ snapshotId: string }>;
  reorderTracks(payload: ReorderTracksPayload): Promise<{ snapshotId: string }>;
  getUserPlaylists(limit?: number, nextCursor?: string | null): Promise<PlaylistPageResult<Playlist>>;
  getPlaylistTracks(
    playlistId: string,
    limit?: number,
    nextCursor?: string | null
  ): Promise<PlaylistTracksPageResult<Track>>;

  fetch(path: string, init?: RequestInit, opts?: ProviderClientOptions): Promise<Response>;
  fetchWithToken(
    accessToken: string,
    path: string,
    init?: RequestInit,
    opts?: ProviderClientOptions
  ): Promise<Response>;
  getJSON<T>(path: string, opts?: ProviderClientOptions): Promise<T>;
}

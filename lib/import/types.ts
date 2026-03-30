export type ImportJobStatus = 'pending' | 'running' | 'done' | 'failed';
export type ImportPlaylistStatus = 'queued' | 'creating' | 'resolving_tracks' | 'adding_tracks' | 'done' | 'failed' | 'partial';

export interface ImportJob {
  id: string;
  sourceProvider: string;
  targetProvider: string;
  status: ImportJobStatus;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportJobPlaylist {
  id: string;
  jobId: string;
  sourcePlaylistId: string;
  sourcePlaylistName: string;
  targetPlaylistId: string | null;
  status: ImportPlaylistStatus;
  trackCount: number;
  tracksResolved: number;
  tracksAdded: number;
  tracksUnresolved: number;
  errorMessage: string | null;
  position: number;
}

export interface CreateImportJobInput {
  sourceProvider: string;
  targetProvider: string;
  createdBy: string;
  playlists: { id: string; name: string }[];
}

export interface ImportJobWithPlaylists extends ImportJob {
  playlists: ImportJobPlaylist[];
  totalPlaylists: number;
  completedPlaylists: number;
}

/**
 * Temporary type shims to satisfy VS Code on host without local node_modules.
 * Remove this file once local node_modules are available on the host.
 */
declare module 'next' {
  export type Metadata = {
    title?: string;
    description?: string;
    [key: string]: any;
  };
}

declare module 'next/font/google' {
  export function Geist(options: { variable?: string; subsets?: string[] }): any;
  export function Geist_Mono(options: { variable?: string; subsets?: string[] }): any;
}

declare module 'sonner' {
  export interface ToasterProps {
    richColors?: boolean;
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  }
  export const Toaster: (props: ToasterProps) => any;
}

declare namespace React {
  type ReactNode = any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

/**
 * Spotify Web Playback SDK type declarations.
 * @see https://developer.spotify.com/documentation/web-playback-sdk/reference
 */
interface Window {
  onSpotifyWebPlaybackSDKReady: () => void;
  Spotify: typeof Spotify;
}

declare namespace Spotify {
  interface PlayerOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface WebPlaybackTrack {
    uri: string;
    id: string | null;
    type: 'track' | 'episode' | 'ad';
    media_type: 'audio' | 'video';
    name: string;
    is_playable: boolean;
    album: {
      uri: string;
      name: string;
      images: Array<{ url: string; height: number; width: number }>;
    };
    artists: Array<{
      uri: string;
      name: string;
    }>;
  }

  interface WebPlaybackState {
    context: {
      uri: string | null;
      metadata: Record<string, unknown>;
    };
    disallows: {
      pausing: boolean;
      peeking_next: boolean;
      peeking_prev: boolean;
      resuming: boolean;
      seeking: boolean;
      skipping_next: boolean;
      skipping_prev: boolean;
    };
    paused: boolean;
    position: number;
    repeat_mode: 0 | 1 | 2;
    shuffle: boolean;
    track_window: {
      current_track: WebPlaybackTrack;
      previous_tracks: WebPlaybackTrack[];
      next_tracks: WebPlaybackTrack[];
    };
    duration: number;
    timestamp: number;
  }

  interface WebPlaybackError {
    message: string;
  }

  interface ReadyEvent {
    device_id: string;
  }

  interface NotReadyEvent {
    device_id: string;
  }

  type PlayerEventCallback<T> = (event: T) => void;

  class Player {
    constructor(options: PlayerOptions);

    connect(): Promise<boolean>;
    disconnect(): void;
    
    addListener(event: 'ready', callback: PlayerEventCallback<ReadyEvent>): boolean;
    addListener(event: 'not_ready', callback: PlayerEventCallback<NotReadyEvent>): boolean;
    addListener(event: 'player_state_changed', callback: PlayerEventCallback<WebPlaybackState | null>): boolean;
    addListener(event: 'initialization_error', callback: PlayerEventCallback<WebPlaybackError>): boolean;
    addListener(event: 'authentication_error', callback: PlayerEventCallback<WebPlaybackError>): boolean;
    addListener(event: 'account_error', callback: PlayerEventCallback<WebPlaybackError>): boolean;
    addListener(event: 'playback_error', callback: PlayerEventCallback<WebPlaybackError>): boolean;
    addListener(event: 'autoplay_failed', callback: PlayerEventCallback<void>): boolean;
    
    removeListener(event: string, callback?: (...args: any[]) => void): boolean;
    
    getCurrentState(): Promise<WebPlaybackState | null>;
    setName(name: string): Promise<void>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    togglePlay(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    previousTrack(): Promise<void>;
    nextTrack(): Promise<void>;
    activateElement(): Promise<void>;
  }
}

// Temporary shims to satisfy VS Code on host without local node_modules.
// Remove these when host-side node_modules is available or when using Dev Containers.

declare module 'next/server' {
  export type NextRequest = any;
  export type NextResponse = any;
  export const NextResponse: any;
}

declare module 'next-auth' {
  export function getServerSession(...args: any[]): Promise<any>;
  export type AuthOptions = any;
  export interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    expires: string;
  }
}

declare module '@tanstack/react-query' {
  export function useInfiniteQuery<
    TQueryFnData = unknown,
    TError = unknown,
    TData = TQueryFnData,
    TQueryKey extends readonly unknown[] = readonly unknown[],
    TPageParam = unknown
  >(options: {
    queryKey: TQueryKey;
    queryFn: (context: { pageParam: TPageParam }) => Promise<TQueryFnData>;
    initialPageParam: TPageParam;
    getNextPageParam: (lastPage: TQueryFnData) => TPageParam | null | undefined;
    enabled?: boolean;
    staleTime?: number;
    [key: string]: any;
  }): {
    data: { pages: TQueryFnData[]; pageParams: TPageParam[] } | undefined;
    fetchNextPage: () => Promise<any>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isLoading: boolean;
    isError: boolean;
    error: TError | null;
    refetch: () => Promise<any>;
    [key: string]: any;
  };
  export function useQuery<TData = unknown, TError = unknown>(options: any): any;
  export function useMutation<TData = unknown, TError = unknown>(options: any): any;
  export function useQueryClient(): QueryClient;
  export class QueryClient {
    constructor(config?: any);
    setQueryData(key: any, data: any): void;
    getQueryData<T = unknown>(key: any): T | undefined;
    cancelQueries(filters?: any): Promise<void>;
    invalidateQueries(filters?: any): Promise<void>;
    refetchQueries(filters?: any): Promise<void>;
    [key: string]: any;
  }
  export function QueryClientProvider(props: { client: QueryClient; children: any }): any;
  export type InfiniteData<T, TPageParam = unknown> = {
    pages: T[];
    pageParams: TPageParam[];
  };
}
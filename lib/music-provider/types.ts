export type ProviderClientOptions = {
  baseUrl?: string;
  backoff?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
};

export interface MusicProvider {
  fetch(path: string, init?: RequestInit, opts?: ProviderClientOptions): Promise<Response>;
  fetchWithToken(
    accessToken: string,
    path: string,
    init?: RequestInit,
    opts?: ProviderClientOptions
  ): Promise<Response>;
  getJSON<T>(path: string, opts?: ProviderClientOptions): Promise<T>;
}

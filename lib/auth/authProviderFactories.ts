import SpotifyProvider from 'next-auth/providers/spotify';
import { serverEnv } from '@/lib/env';

const TIDAL_AUTHORIZATION_URL = 'https://login.tidal.com/authorize';
const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
const TIDAL_USERINFO_URL = 'https://openapi.tidal.com/v2/users/me';
const TIDAL_JSON_API_CONTENT_TYPE = 'application/vnd.api+json';
const TIDAL_SCOPES = 'user.read playlists.read playlists.write collection.read collection.write search.read';

function toTidalProfileData(profile: any): Record<string, any> {
  if (profile && typeof profile === 'object' && profile.data) {
    return profile.data as Record<string, any>;
  }

  return (profile ?? {}) as Record<string, any>;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getTidalDisplayName(username: string | null, email: string | null): string {
  if (username) {
    return username;
  }

  if (email) {
    return email;
  }

  return 'TIDAL User';
}

function mapTidalProfile(profile: any): { id: string; name: string; email: string | null; image: null } {
  const rawData = toTidalProfileData(profile);
  const attributes = (rawData.attributes ?? {}) as Record<string, unknown>;
  const id = String(rawData.id ?? '');
  const email = toOptionalString(attributes.email);
  const username = toOptionalString(attributes.username);

  return {
    id,
    name: getTidalDisplayName(username, email),
    email,
    image: null,
  };
}

export function createSpotifyAuthProvider() {
  if (!serverEnv.SPOTIFY_CLIENT_ID || !serverEnv.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify provider enabled but SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET are missing');
  }

  return SpotifyProvider({
    clientId: serverEnv.SPOTIFY_CLIENT_ID,
    clientSecret: serverEnv.SPOTIFY_CLIENT_SECRET,
    authorization: {
      params: {
        scope: 'user-read-email user-read-private playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify user-read-playback-state user-modify-playback-state streaming',
        show_dialog: true,
      },
    },
    checks: ['pkce', 'state'],
  });
}

export function createTidalAuthProvider() {
  if (!serverEnv.TIDAL_CLIENT_ID || !serverEnv.TIDAL_CLIENT_SECRET) {
    throw new Error('TIDAL provider enabled but TIDAL_CLIENT_ID/TIDAL_CLIENT_SECRET are missing');
  }

  const requestUserinfo = async ({ tokens }: { tokens?: { access_token?: string } }): Promise<any> => {
    const accessToken = tokens?.access_token;
    if (!accessToken) {
      throw new Error('[auth] Missing TIDAL access token in userinfo request');
    }

    const response = await fetch(TIDAL_USERINFO_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: TIDAL_JSON_API_CONTENT_TYPE,
      },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(
        `[auth] TIDAL userinfo failed: ${response.status} ${response.statusText}${details ? ` ${details}` : ''}`
      );
    }

    return response.json();
  };

  return {
    id: 'tidal',
    name: 'TIDAL',
    type: 'oauth',
    clientId: serverEnv.TIDAL_CLIENT_ID,
    clientSecret: serverEnv.TIDAL_CLIENT_SECRET,
    authorization: {
      url: TIDAL_AUTHORIZATION_URL,
      params: {
        scope: TIDAL_SCOPES,
      },
    },
    token: {
      url: TIDAL_TOKEN_URL,
    },
    userinfo: {
      url: TIDAL_USERINFO_URL,
      request: requestUserinfo,
    },
    checks: ['pkce', 'state'],
    profile(profile: any) {
      return mapTidalProfile(profile);
    },
  } as any;
}

export { TIDAL_TOKEN_URL };

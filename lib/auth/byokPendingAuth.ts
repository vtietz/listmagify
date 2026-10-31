import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import type { MusicProviderId } from '@/lib/music-provider/types';

/**
 * Pending BYOK OAuth handshake data.
 *
 * Kept server-side in an encrypted HttpOnly cookie between the init route and
 * the provider callback, so credentials and PKCE verifiers never appear in the
 * authorization URL. The `state` sent to the provider is a random nonce bound
 * to this cookie.
 */
export interface ByokPendingAuth {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  codeVerifier?: string;
}

interface ByokPendingCookiePayload extends ByokPendingAuth {
  state: string;
  timestamp: number;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PENDING_TTL_SECONDS = 5 * 60;
const COOKIE_PATH = '/api/auth/byok';
const DEFAULT_CALLBACK_URL = '/playlists';

export function getByokPendingCookieName(providerId: MusicProviderId): string {
  return `__listmagify_byok_${providerId}`;
}

function getKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', serverEnv.NEXTAUTH_SECRET, 'listmagify-byok', 'pending-auth', 32));
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decrypt(ciphertext: string): string {
  const [iv, tag, encrypted] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted) {
    throw new Error('state_mismatch');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function isSecureDeployment(): boolean {
  return serverEnv.NEXTAUTH_URL.startsWith('https://');
}

function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Restrict post-login redirects to this app's origin.
 * Returns a relative path (pathname + search + hash) or the default.
 */
export function sanitizeCallbackUrl(callbackUrl: unknown): string {
  if (typeof callbackUrl !== 'string' || callbackUrl.length === 0) {
    return DEFAULT_CALLBACK_URL;
  }

  try {
    const base = new URL(serverEnv.NEXTAUTH_URL);
    const resolved = new URL(callbackUrl, base);
    if (resolved.origin !== base.origin) {
      return DEFAULT_CALLBACK_URL;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}

/** Opaque OAuth state value; carries no data. */
export function createByokState(): string {
  return randomBytes(32).toString('base64url');
}

/** Store pending BYOK auth data on the response, bound to `state`. */
export function setByokPendingAuth(
  response: NextResponse,
  providerId: MusicProviderId,
  state: string,
  data: ByokPendingAuth,
): void {
  const payload: ByokPendingCookiePayload = {
    ...data,
    callbackUrl: sanitizeCallbackUrl(data.callbackUrl),
    state,
    timestamp: Date.now(),
  };

  response.cookies.set(getByokPendingCookieName(providerId), encrypt(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: 'lax',
    path: COOKIE_PATH,
    secure: isSecureDeployment(),
    maxAge: PENDING_TTL_SECONDS,
  });
}

/**
 * Read and validate pending BYOK auth data for a provider callback.
 * Throws `state_mismatch` or `state_expired`.
 */
export function readByokPendingAuth(
  request: NextRequest,
  providerId: MusicProviderId,
  state: string,
): ByokPendingAuth {
  const raw = request.cookies.get(getByokPendingCookieName(providerId))?.value;
  if (!raw) {
    throw new Error('state_mismatch');
  }

  let payload: ByokPendingCookiePayload;
  try {
    payload = JSON.parse(decrypt(raw)) as ByokPendingCookiePayload;
  } catch {
    throw new Error('state_mismatch');
  }

  if (!statesMatch(payload.state, state)) {
    throw new Error('state_mismatch');
  }

  if (Date.now() - payload.timestamp > PENDING_TTL_SECONDS * 1000) {
    throw new Error('state_expired');
  }

  const { clientId, clientSecret, callbackUrl, codeVerifier } = payload;
  return { clientId, clientSecret, callbackUrl: sanitizeCallbackUrl(callbackUrl), ...(codeVerifier ? { codeVerifier } : {}) };
}

export function clearByokPendingAuth(response: NextResponse, providerId: MusicProviderId): void {
  response.cookies.set(getByokPendingCookieName(providerId), '', {
    httpOnly: true,
    sameSite: 'lax',
    path: COOKIE_PATH,
    secure: isSecureDeployment(),
    maxAge: 0,
  });
}

import { z } from "zod";
import { parseSyncIntervalOptions } from '@/lib/sync/types';

type ConfiguredMusicProvider = 'spotify' | 'tidal';
const DEFAULT_MUSIC_PROVIDERS: ConfiguredMusicProvider[] = ['spotify'];

function parseMusicProviders(raw: string | undefined): ConfiguredMusicProvider[] {
  if (!raw) {
    return [...DEFAULT_MUSIC_PROVIDERS];
  }

  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ConfiguredMusicProvider => value === 'spotify' || value === 'tidal');

  if (parsed.length === 0) {
    return [...DEFAULT_MUSIC_PROVIDERS];
  }

  return Array.from(new Set(parsed));
}

/**
 * Server-side environment validation (do not expose secrets to the client).
 * Add any NEXT_PUBLIC_* keys to clientSchema if/when needed.
 */
const serverSchema = z.object({
  NEXTAUTH_URL: z
    .string()
    .url("NEXTAUTH_URL must be a valid URL (e.g. http://localhost:3000)"),
  NEXTAUTH_SECRET: z
    .string()
    .min(1, "NEXTAUTH_SECRET is required"),
  SPOTIFY_CLIENT_ID: z
    .string()
    .optional(),
  SPOTIFY_CLIENT_SECRET: z
    .string()
    .optional(),
  TIDAL_CLIENT_ID: z
    .string()
    .optional(),
  TIDAL_CLIENT_SECRET: z
    .string()
    .optional(),
  MUSIC_PROVIDERS: z
    .string()
    .optional()
    .transform((val) => parseMusicProviders(val)),
  // Optional: polling interval in seconds for auto-reloading playlists (0 or undefined = disabled)
  PLAYLIST_POLL_INTERVAL_SECONDS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseInt(val, 10);
      return isNaN(num) || num <= 0 ? undefined : num;
    }),
  // Optional: sync interval dropdown options (comma-separated, e.g. 15m,30m,1h)
  SYNC_INTERVAL_OPTIONS: z
    .string()
    .optional()
    .transform((val) => parseSyncIntervalOptions(val)),
  // Optional: allow users to bring their own Spotify API keys
  SPOTIFY_BYOK_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  // Optional: enable access request feature
  ACCESS_REQUEST_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  // Optional: require email verification for access requests
  ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
}).superRefine((env, ctx) => {
  if (env.MUSIC_PROVIDERS.includes('spotify')) {
    if (!env.SPOTIFY_CLIENT_ID || env.SPOTIFY_CLIENT_ID.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SPOTIFY_CLIENT_ID'],
        message: 'SPOTIFY_CLIENT_ID is required when spotify is enabled in MUSIC_PROVIDERS',
      });
    }

    if (!env.SPOTIFY_CLIENT_SECRET || env.SPOTIFY_CLIENT_SECRET.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SPOTIFY_CLIENT_SECRET'],
        message: 'SPOTIFY_CLIENT_SECRET is required when spotify is enabled in MUSIC_PROVIDERS',
      });
    }
  }

  if (env.MUSIC_PROVIDERS.includes('tidal')) {
    if (!env.TIDAL_CLIENT_ID || env.TIDAL_CLIENT_ID.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TIDAL_CLIENT_ID'],
        message: 'TIDAL_CLIENT_ID is required when tidal is enabled in MUSIC_PROVIDERS',
      });
    }

    if (!env.TIDAL_CLIENT_SECRET || env.TIDAL_CLIENT_SECRET.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TIDAL_CLIENT_SECRET'],
        message: 'TIDAL_CLIENT_SECRET is required when tidal is enabled in MUSIC_PROVIDERS',
      });
    }
  }
});

type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Client (public) environment validation.
 * Keep empty for now — add NEXT_PUBLIC_* keys here when needed.
 */
const clientSchema = z.object({});
type ClientEnv = z.infer<typeof clientSchema>;

/**
 * Parse and export typed envs.
 * Throws fast during boot if any required value is missing/invalid.
 * During build/dev without .env values, use safe defaults (auth won't work but app loads).
 */
export const serverEnv: ServerEnv = (() => {
  // Allow app to load without env vars (auth won't work but pages render)
  if (!process.env.NEXTAUTH_URL) {
    console.warn('[env] Missing NEXTAUTH_URL - using defaults. Auth will not work.');
    return {
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'dev-placeholder-secret',
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      TIDAL_CLIENT_ID: '',
      TIDAL_CLIENT_SECRET: '',
      MUSIC_PROVIDERS: [...DEFAULT_MUSIC_PROVIDERS],
      PLAYLIST_POLL_INTERVAL_SECONDS: undefined,
      SYNC_INTERVAL_OPTIONS: parseSyncIntervalOptions(undefined),
      SPOTIFY_BYOK_ENABLED: false,
      ACCESS_REQUEST_ENABLED: false,
      ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED: false,
    };
  }
  return serverSchema.parse({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    TIDAL_CLIENT_ID: process.env.TIDAL_CLIENT_ID,
    TIDAL_CLIENT_SECRET: process.env.TIDAL_CLIENT_SECRET,
    MUSIC_PROVIDERS: process.env.MUSIC_PROVIDERS,
    PLAYLIST_POLL_INTERVAL_SECONDS: process.env.PLAYLIST_POLL_INTERVAL_SECONDS,
    SYNC_INTERVAL_OPTIONS: process.env.SYNC_INTERVAL_OPTIONS,
    SPOTIFY_BYOK_ENABLED: process.env.SPOTIFY_BYOK_ENABLED ?? process.env.BYOK_ENABLED,
    ACCESS_REQUEST_ENABLED: process.env.ACCESS_REQUEST_ENABLED,
    ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED: process.env.ACCESS_REQUEST_EMAIL_VERIFICATION_ENABLED,
  });
})();

export const clientEnv: ClientEnv = clientSchema.parse({});

/**
 * Helper to print a concise summary (avoid leaking secrets in logs).
 */
export function summarizeEnv(): string {
  return [
    `NEXTAUTH_URL=${serverEnv.NEXTAUTH_URL}`,
    `NEXTAUTH_SECRET=${serverEnv.NEXTAUTH_SECRET ? "[set]" : "[missing]"}`,
    `MUSIC_PROVIDERS=${serverEnv.MUSIC_PROVIDERS.join(',')}`,
    `SYNC_INTERVAL_OPTIONS=${serverEnv.SYNC_INTERVAL_OPTIONS.join(',')}`,
    `SPOTIFY_CLIENT_ID=${serverEnv.SPOTIFY_CLIENT_ID ? "[set]" : "[missing]"}`,
    `SPOTIFY_CLIENT_SECRET=${serverEnv.SPOTIFY_CLIENT_SECRET ? "[set]" : "[missing]"}`,
    `TIDAL_CLIENT_ID=${serverEnv.TIDAL_CLIENT_ID ? "[set]" : "[missing]"}`,
    `TIDAL_CLIENT_SECRET=${serverEnv.TIDAL_CLIENT_SECRET ? "[set]" : "[missing]"}`,
  ].join(" | ");
}
import { z } from "zod";

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
    .min(1, "SPOTIFY_CLIENT_ID is required"),
  SPOTIFY_CLIENT_SECRET: z
    .string()
    .min(1, "SPOTIFY_CLIENT_SECRET is required"),
  // Optional: polling interval in seconds for auto-reloading playlists (0 or undefined = disabled)
  PLAYLIST_POLL_INTERVAL_SECONDS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const num = parseInt(val, 10);
      return isNaN(num) || num <= 0 ? undefined : num;
    }),
  // Optional: allow users to bring their own Spotify API keys
  BYOK_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
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
      SPOTIFY_CLIENT_ID: 'missing-client-id',
      SPOTIFY_CLIENT_SECRET: 'missing-client-secret',
      PLAYLIST_POLL_INTERVAL_SECONDS: undefined,
      BYOK_ENABLED: false,
    };
  }
  return serverSchema.parse({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    PLAYLIST_POLL_INTERVAL_SECONDS: process.env.PLAYLIST_POLL_INTERVAL_SECONDS,
    BYOK_ENABLED: process.env.BYOK_ENABLED,
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
    `SPOTIFY_CLIENT_ID=${serverEnv.SPOTIFY_CLIENT_ID ? "[set]" : "[missing]"}`,
    `SPOTIFY_CLIENT_SECRET=${serverEnv.SPOTIFY_CLIENT_SECRET ? "[set]" : "[missing]"}`,
  ].join(" | ");
}
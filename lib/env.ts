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
 */
export const serverEnv: ServerEnv = serverSchema.parse({
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
});

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
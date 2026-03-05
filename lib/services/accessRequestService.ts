import { z } from 'zod';
import { routeErrors } from '@/lib/errors';

const requestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Valid email is required'),
  spotifyUsername: z.string().trim().optional(),
  motivation: z.string().trim().optional(),
  verificationToken: z.string().optional(),
});

const verifyEmailSchema = z.object({
  email: z.string().trim().email('Valid email is required').transform((value) => value.toLowerCase()),
});

const verifyCodeSchema = z.object({
  email: z.string().trim().email('Valid email is required').transform((value) => value.toLowerCase()),
  code: z.string().trim().length(6, 'Valid 6-digit code is required'),
});

export interface AccessRequestInput {
  name: string;
  email: string;
  spotifyUsername?: string;
  motivation?: string;
  verificationToken?: string;
}

export function parseAccessRequestInput(body: unknown): AccessRequestInput {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  return {
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    ...(parsed.data.spotifyUsername ? { spotifyUsername: parsed.data.spotifyUsername } : {}),
    ...(parsed.data.motivation ? { motivation: parsed.data.motivation } : {}),
    ...(parsed.data.verificationToken ? { verificationToken: parsed.data.verificationToken } : {}),
  };
}

export function parseVerifyEmailInput(body: unknown): { email: string } {
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid email');
  }
  return parsed.data;
}

export function parseVerifyCodeInput(body: unknown): { email: string; code: string } {
  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid verification payload');
  }
  return parsed.data;
}

export function detectAccessRequestRedFlags(payload: {
  name: string;
  spotifyUsername?: string;
  motivation?: string;
}): string[] {
  const redFlags: string[] = [];
  const nameTrimmed = payload.name.trim();
  const spotifyUsernameTrimmed = payload.spotifyUsername?.trim();

  if (!nameTrimmed.includes(' ') && nameTrimmed === nameTrimmed.toLowerCase()) {
    redFlags.push('Name looks like username (no spaces, lowercase)');
  }

  if (spotifyUsernameTrimmed && spotifyUsernameTrimmed.includes(' ')) {
    redFlags.push('Spotify username contains spaces (invalid)');
  }

  if (nameTrimmed.length < 3) {
    redFlags.push('Name too short (< 3 chars)');
  }

  const motivationLower = payload.motivation?.trim().toLowerCase();
  if (motivationLower) {
    const genericPhrases = [
      'para melhorar',
      'to improve',
      'want to use',
      'please approve',
      'give me access',
      'test',
      'testing',
    ];

    if (genericPhrases.some((phrase) => motivationLower === phrase || motivationLower.length < 10)) {
      redFlags.push('Generic or very short motivation');
    }
  }

  return redFlags;
}
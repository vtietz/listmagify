import { z } from 'zod';
import { routeErrors } from '@/lib/errors';

const playlistIdSchema = z.string().trim().min(1, 'Invalid playlist ID');

const updatePlaylistSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined || value.isPublic !== undefined, {
    message: 'No fields to update',
  });

export function parsePlaylistId(value: unknown): string {
  const parsed = playlistIdSchema.safeParse(value);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid playlist ID');
  }
  return parsed.data;
}

export function parsePlaylistUpdatePayload(body: unknown): Record<string, unknown> {
  const parsed = updatePlaylistSchema.safeParse(body);
  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid playlist update payload');
  }

  const payload: Record<string, unknown> = {};
  if (typeof parsed.data.name === 'string') {
    const normalizedName = parsed.data.name.trim();
    if (normalizedName.length === 0) {
      throw routeErrors.validation('Playlist name cannot be empty');
    }
    payload.name = normalizedName;
  }
  if (typeof parsed.data.description === 'string') {
    payload.description = parsed.data.description;
  }
  if (typeof parsed.data.isPublic === 'boolean') {
    payload.public = parsed.data.isPublic;
  }

  return payload;
}

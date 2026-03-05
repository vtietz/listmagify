import { z } from 'zod';
import { routeErrors } from '@/lib/errors';

const accessRequestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  sortBy: z.enum(['date', 'activity', 'name']).default('date'),
  search: z.string().optional(),
});

export function parseAccessRequestQuery(searchParams: URLSearchParams) {
  const parsed = accessRequestQuerySchema.safeParse({
    limit: searchParams.get('limit') ?? '50',
    offset: searchParams.get('offset') ?? '0',
    status: searchParams.get('status') ?? undefined,
    sortBy: searchParams.get('sortBy') ?? 'date',
    search: searchParams.get('search') ?? undefined,
  });

  if (!parsed.success) {
    throw routeErrors.validation(parsed.error.issues[0]?.message ?? 'Invalid query params');
  }

  return parsed.data;
}
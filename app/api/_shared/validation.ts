import { z } from 'zod';

export interface ValidationFailure {
  ok: false;
  message: string;
  issues: Array<{ path: string; message: string }>;
}

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationFailure | ValidationSuccess<T>;

export function parseWithSchema<T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  return {
    ok: false,
    message: 'Validation failed',
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export const emailSchema = z.string().trim().email();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
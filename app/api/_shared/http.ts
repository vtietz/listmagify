import { NextResponse } from 'next/server';
import { AppRouteError, isAppRouteError } from '@/lib/errors';

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
}

function problem(error: AppRouteError): ProblemDetail {
  return {
    type: error.type,
    title: error.message,
    status: error.status,
    ...(error.detail ? { detail: error.detail } : {}),
  };
}

function json<T>(status: number, body: T): NextResponse {
  return NextResponse.json(body, { status });
}

export function ok<T>(data: T): NextResponse {
  return json(200, data);
}

export function created<T>(data: T): NextResponse {
  return json(201, data);
}

export function badRequest(title: string, detail?: string): NextResponse {
  return json(400, { error: title, detail });
}

export function unauthorized(title = 'Authentication required', detail?: string): NextResponse {
  return json(401, { error: title, detail });
}

export function forbidden(title = 'Forbidden', detail?: string): NextResponse {
  return json(403, { error: title, detail });
}

export function notFound(title = 'Not found', detail?: string): NextResponse {
  return json(404, { error: title, detail });
}

export function conflict(title: string, detail?: string): NextResponse {
  return json(409, { error: title, detail });
}

export function unprocessableContent(title: string, detail?: string): NextResponse {
  return json(422, { error: title, detail });
}

export function internalError(title = 'Internal server error'): NextResponse {
  return json(500, { error: title });
}

export function fromError(error: unknown, fallbackMessage = 'Internal server error'): NextResponse {
  if (isAppRouteError(error)) {
    return NextResponse.json(problem(error), { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return json(500, { error: message || fallbackMessage });
}
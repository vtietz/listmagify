import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function createTraceId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${randomPart}`;
}

export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? '';

  // Keep a single canonical host in development to avoid OAuth state-cookie mismatches
  // between localhost and 127.0.0.1 during Spotify sign-in callbacks.
  if (process.env.NODE_ENV === 'development' && host.startsWith('localhost')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.hostname = '127.0.0.1';
    return NextResponse.redirect(redirectUrl);
  }

  const requestUrl = request.nextUrl;

  if (requestUrl.pathname !== '/_next/image') {
    return NextResponse.next();
  }

  const traceId = createTraceId();
  const accept = request.headers.get('accept') ?? '';
  const userAgent = request.headers.get('user-agent') ?? '';
  const imageUrl = requestUrl.searchParams.get('url') ?? '';
  const width = requestUrl.searchParams.get('w') ?? '';
  const quality = requestUrl.searchParams.get('q') ?? '';

  console.debug(
    JSON.stringify({
      event: 'image_optimizer_request',
      traceId,
      path: requestUrl.pathname,
      imageUrl,
      width,
      quality,
      acceptsWebp: accept.includes('image/webp'),
      acceptsAvif: accept.includes('image/avif'),
      userAgent,
      host: request.headers.get('host') ?? '',
      method: request.method,
    }),
  );

  const response = NextResponse.next();
  response.headers.set('x-image-diag-id', traceId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|favicon.ico).*)'],
};
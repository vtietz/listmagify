# Authentication & Token Security

This document describes how **Listmagify** implements secure, persistent Spotify OAuth authentication using NextAuth.js with the JWT strategy.

## Security Model

### 1. **Token Storage - Server-Side Only**

- ✅ **Access tokens** and **refresh tokens** are stored exclusively in **server-side JWT cookies**
- ✅ **httpOnly cookies** prevent JavaScript access, eliminating XSS token theft
- ✅ **No localStorage** or client-side storage is used
- ✅ Tokens are **never exposed to the browser** or client components

### 2. **Session Persistence**

Tokens persist across browser restarts for **30 days** with automatic refresh:

```typescript
session: {
  strategy: "jwt",
  maxAge: 30 * 24 * 60 * 60,    // 30 days
  updateAge: 12 * 60 * 60,       // Refresh every 12 hours
}
```

- The session cookie expires 30 days after login
- Cookies are reissued every 12 hours to keep the session fresh
- Closing/reopening the browser maintains the session

### 3. **Token Refresh Flow**

Access tokens expire after 1 hour. The refresh flow is **fully automatic and transparent**:

1. **Early Refresh**: NextAuth checks token expiry with a **5-minute buffer** in the `jwt()` callback
2. **Automatic Refresh**: If expiring within 5 minutes, calls `refreshAccessToken()` with the stored refresh token
3. **Token Update**: Requests a new access token from Spotify's `/api/token` endpoint
4. **Seamless Update**: Updates the JWT with the new token (transparent to the user, no interruption)
5. **Error Handling**: If refresh fails (revoked token), sets `error: "RefreshAccessTokenError"`

**Key Points**:
- Users never experience token expiration during normal browsing
- Refresh happens in the background before the token actually expires
- Failed refresh triggers graceful error handling (see below)

### 4. **Cookie Security Configuration**

Production cookies are hardened with:

```typescript
cookies: {
  sessionToken: {
    options: {
      httpOnly: true,              // No JavaScript access
      secure: true,                // HTTPS-only (production)
      sameSite: "lax",             // CSRF protection, allows OAuth redirects
      path: "/",
    },
  },
}
```

### 5. **Client-Side Access**

Client components access **only user profile data**, never tokens:

```typescript
// ✅ Safe - exposes only user info
const { user, authenticated } = useSessionUser();

// ❌ Never do this - tokens stay server-side
// const token = session.accessToken; // NOT available on client
```

### 6. **Server-Side Token Usage**

All Spotify API calls use server-side session access:

```typescript
// Server Component or Route Handler
const session = await getServerSession(authOptions);
const accessToken = (session as any).accessToken;

// Or use the spotify client
const data = await getJSON<SpotifyPlaylist>("/me/playlists");
```

### 7. **Graceful 401 Error Handling**

When tokens expire or become invalid (despite automatic refresh), the app **automatically redirects users to login** with no manual intervention required:

**Server-Side (SSR Pages)**:
- Playlists pages catch 401 errors in try/catch blocks
- Immediately redirect to `/login?reason=expired`
- User sees friendly "session expired" message

**Client-Side (Interactive Components)** - **Fully Automatic**:
- API routes return consistent `{ error: "token_expired" }` with status 401
- Centralized `apiFetch` wrapper (`lib/api/client.ts`) **automatically handles all 401 errors**
- Shows toast: "Your session has expired. Redirecting to login..."
- Waits 1.5 seconds for toast visibility, then **automatically navigates** to `/login?reason=expired`
- Preserves current page URL in `next` parameter to return after re-authentication
- All fetch calls use `apiFetch<T>()` - **zero manual 401 checking required**
- Custom `ApiError` class for typed error handling

**Error Flow**:
1. Spotify returns 401 (token expired/revoked)
2. API route detects 401, forwards with `token_expired` error
3. Client component shows user-friendly message with toast notification
4. **Automatic redirect to login page after 1.5s delay** (no user action needed)
5. Login page displays expired session notice
6. After re-authentication, user returns to original page via `next` parameter

**What triggers 401** (rare, thanks to automatic token refresh):
- User revoked app access in Spotify settings
- Refresh token expired (rare, usually 1 year+)
- Spotify service issue or token corruption
- Manual token deletion from database
- Session expired after 30 days of inactivity

**Note**: Under normal usage, you should **never see session expiration** because tokens auto-refresh 5 minutes before expiry. The 401 handling is a safety net for edge cases like revoked access or long-term inactivity.

### 8. **Logout**

Explicit logout:
- Calls `signOut({ callbackUrl: "/login" })`
- Removes all session cookies
- Ends persistence immediately
- User must re-authenticate to access protected resources

## File Responsibilities

| File | Purpose |
|------|---------|
| `lib/auth/auth.ts` | NextAuth configuration, token refresh logic |
| `lib/api/client.ts` | Centralized API client with automatic 401 handling |
| `components/auth/SessionErrorHandler.tsx` | Monitors for refresh errors, forces re-auth |
| `hooks/useSessionUser.ts` | Client hook for user profile (no tokens) |
| `lib/spotify/client.ts` | Server-side Spotify API client with token injection |
| `app/logout/page.tsx` | Logout UI, calls NextAuth signOut |

## Centralized API Client

To eliminate code duplication, all client-side API calls use the centralized `apiFetch` wrapper (`lib/api/client.ts`):

**Usage Example**:
```typescript
import { apiFetch, ApiError } from "@/lib/api/client";

// Simple GET request with automatic 401 handling
const data = await apiFetch<{ items: Playlist[] }>("/api/me/playlists");

// POST/PUT with request body
const result = await apiFetch<{ snapshotId: string }>("/api/playlists/123/reorder", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fromIndex: 0, toIndex: 5 }),
});

// Skip automatic redirect for custom handling
try {
  const data = await apiFetch("/api/endpoint", { skipAutoRedirect: true });
} catch (error) {
  if (error instanceof ApiError && error.isUnauthorized()) {
    // Custom 401 handling
  }
}
```

**Features**:
- Automatic 401 detection and redirect
- User-friendly error toasts
- TypeScript generic support for response types
- Helper methods: `isUnauthorized()`, `isForbidden()`, `isNotFound()`
- Optional `skipAutoRedirect` for custom error handling

**Benefits**:
- Eliminates ~50+ lines of duplicated error handling code
- Consistent UX for authentication errors
- Single source of truth for API error behavior
- Easy to extend with additional features (retries, rate limiting, etc.)

## Production Checklist

Before deploying to production, ensure:

- [ ] `NEXTAUTH_URL` uses `https://` (not `http://`)
- [ ] `NEXTAUTH_SECRET` is a strong random value (32+ bytes)
- [ ] Spotify OAuth redirect URI exactly matches production URL
- [ ] Environment variables are set in production hosting (Vercel, Railway, etc.)
- [ ] CSP headers block inline scripts (optional but recommended)
- [ ] Rotate `NEXTAUTH_SECRET` only when acceptable to invalidate all sessions

## Token Scopes

Current scopes (with editing capabilities):
```typescript
scope: "user-read-email playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify"
```

**Scopes breakdown**:
- `user-read-email`: Access user profile information
- `playlist-read-private`: View user's private playlists
- `playlist-modify-private`: Edit user's private playlists (reorder, add/remove tracks)
- `playlist-modify-public`: Edit user's public playlists (reorder, add/remove tracks)
- `user-library-read`: Read access to user's "Liked Songs" library
- `user-library-modify`: Save/remove tracks from user's "Liked Songs" library

**Note**: Changing scopes requires users to re-authenticate to grant new permissions. Users who authenticated before the scope update will need to log out and log back in.

## Environment Variables

Required in `.env`:

```bash
NEXTAUTH_URL=http://localhost:3000  # Use https:// in production
NEXTAUTH_SECRET=<strong-random-secret>
SPOTIFY_CLIENT_ID=<from-spotify-dashboard>
SPOTIFY_CLIENT_SECRET=<from-spotify-dashboard>
```

## Security Notes

1. **XSS Protection**: httpOnly cookies cannot be accessed by JavaScript, even if an XSS vulnerability exists
2. **CSRF Protection**: `sameSite: "lax"` prevents cross-site request forgery while allowing OAuth flows
3. **Token Rotation**: Access tokens refresh automatically; refresh tokens persist for 30 days
4. **Logout Guarantees**: signOut immediately clears cookies; no client-side storage cleanup needed
5. **HTTPS Enforcement**: Production must use HTTPS; cookies set `secure: true` automatically

## Login-First UX

The app implements a **login-first experience** for unauthenticated users:

- **Root page (`/`)**: Checks authentication status
  - If authenticated → redirects to `/playlists`
  - If not authenticated → redirects to `/login`
- **Protected routes**: All `/playlists/*` routes protected by middleware
- **Automatic routing**: Unauthenticated requests to protected pages redirect to `/login`

This ensures users are always authenticated before accessing playlist features.

## Common Issues

### "Missing access token" error
- User is not authenticated
- Session expired after 30 days
- Refresh token was revoked by user in Spotify settings
- **Solution**: App automatically redirects to `/login?reason=expired`

### Session not persisting after browser restart
- Check `session.maxAge` is set (30 days)
- Verify cookies aren't blocked by browser settings
- Ensure `secure: true` only in production (not localhost)

### INVALID_CLIENT error from Spotify
- Client ID or Secret is incorrect
- Redirect URI doesn't match Spotify dashboard exactly
- **Solution**: Verify credentials in `.env` and Spotify app settings

### "Your session has expired" appearing frequently
- Check system clock is accurate (token expiry depends on timestamp)
- Verify Spotify API is returning valid `expires_at` values
- Review logs for "Token expiring soon or expired, refreshing..." messages
- If refresh consistently fails, user may need to re-authenticate

---

**Implementation Date**: October 18, 2025  
**NextAuth Version**: 4.24.11  
**Security Audit**: Tokens never exposed to client, httpOnly cookies, automatic refresh, forced logout on error

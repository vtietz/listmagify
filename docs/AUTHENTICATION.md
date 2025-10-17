# Authentication & Token Security

This document describes how **spotify-playlist-editor** implements secure, persistent Spotify OAuth authentication using NextAuth.js with the JWT strategy.

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

Access tokens expire after 1 hour. The refresh flow is:

1. NextAuth detects token expiry in the `jwt()` callback
2. Calls `refreshAccessToken()` with the stored refresh token
3. Requests a new access token from Spotify's token endpoint
4. Updates the JWT with the new token (transparent to the user)
5. If refresh fails (revoked token), sets `error: "RefreshAccessTokenError"`

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

### 7. **Automatic Error Handling**

If token refresh fails (e.g., user revoked access in Spotify):

1. `SessionErrorHandler` detects the error
2. Automatically signs out the user
3. Redirects to `/login` for re-authentication
4. Clears all cookies immediately

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
| `components/auth/SessionErrorHandler.tsx` | Monitors for refresh errors, forces re-auth |
| `hooks/useSessionUser.ts` | Client hook for user profile (no tokens) |
| `lib/spotify/client.ts` | Server-side Spotify API client with token injection |
| `app/logout/page.tsx` | Logout UI, calls NextAuth signOut |

## Production Checklist

Before deploying to production, ensure:

- [ ] `NEXTAUTH_URL` uses `https://` (not `http://`)
- [ ] `NEXTAUTH_SECRET` is a strong random value (32+ bytes)
- [ ] Spotify OAuth redirect URI exactly matches production URL
- [ ] Environment variables are set in production hosting (Vercel, Railway, etc.)
- [ ] CSP headers block inline scripts (optional but recommended)
- [ ] Rotate `NEXTAUTH_SECRET` only when acceptable to invalidate all sessions

## Token Scopes

Current scopes (read-only):
```typescript
scope: "user-read-email playlist-read-private"
```

To add write capabilities (playlist editing), expand scopes:
```typescript
scope: "user-read-email playlist-read-private playlist-modify-public playlist-modify-private"
```

Changing scopes requires users to re-authenticate to grant new permissions.

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

## Common Issues

### "Missing access token" error
- User is not authenticated
- Session expired after 30 days
- Refresh token was revoked by user in Spotify settings
- **Solution**: Redirect to `/login` for re-authentication

### Session not persisting after browser restart
- Check `session.maxAge` is set (30 days)
- Verify cookies aren't blocked by browser settings
- Ensure `secure: true` only in production (not localhost)

### INVALID_CLIENT error from Spotify
- Client ID or Secret is incorrect
- Redirect URI doesn't match Spotify dashboard exactly
- **Solution**: Verify credentials in `.env` and Spotify app settings

---

**Implementation Date**: October 18, 2025  
**NextAuth Version**: 4.24.11  
**Security Audit**: Tokens never exposed to client, httpOnly cookies, automatic refresh, forced logout on error

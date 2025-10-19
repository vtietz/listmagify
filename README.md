# Spotify Playlist Editor

A modern Spotify playlist editor built with **Next.js 15**, **TypeScript**, and **React 19**.

## Features

- **Interactive Playlist Management**:
  - Search tracks by title, artist, or album (debounced for performance)
  - Sort tracks by position, title, artist, album, duration, or date added
  - Drag-and-drop reordering (with keyboard accessibility)
  - Refresh from Spotify with optimistic concurrency control
  
- **Multi-Instance Ready**: Multiple playlists can be edited simultaneously without state conflicts

- **Robust Error Handling**: Optimistic updates with automatic rollback on failure

- **Accessibility**: WCAG compliant with keyboard navigation, ARIA labels, and screen reader support

## Setup

1. **Initialize environment file**:
   ```cmd
   run.bat init-env
   ```

2. **Add your Spotify credentials** to `.env`:
   ```bash
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   NEXTAUTH_SECRET=your_random_secret
   PORT=3000
   ```

3. **Configure Spotify OAuth** in your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
   - Redirect URI: `http://127.0.0.1:3000/api/auth/callback/spotify`
   - Note: Use `127.0.0.1` (not `localhost`) as required by Spotify

4. **Start the development server**:
   ```cmd
   run.bat install
   run.bat start
   ```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser

## Docker Commands

All development happens inside Docker. Use these wrappers:

**Windows (cmd.exe)**:
```cmd
run.bat install           # Install dependencies
run.bat start             # Start dev server
run.bat test              # Run tests
run.bat test -- --watch   # Run tests in watch mode
run.bat compose down      # Stop containers
```

**Windows (PowerShell)**:
```powershell
.\run.bat install
.\run.bat start
.\run.bat test
```

**macOS/Linux**:
```bash
./run.sh install
./run.sh start
./run.sh test
```

## Testing

### Unit Tests

Run with Vitest:
```cmd
run.bat test              # Run once
run.bat test -- --watch   # Watch mode
```

### E2E Tests

End-to-end tests use **Playwright** with a fully isolated Docker environment:

- **Test server** on port 3100 (doesn't interfere with dev server)
- **Mock Spotify API** for deterministic, fast tests
- **No real OAuth** required (E2E_MODE bypasses authentication)

**Start the test stack**:
```cmd
run.bat test stack:up     # Start web-test + spotify-mock
run.bat test stack:logs   # View logs
```

**Run E2E tests**:
```cmd
run.bat test e2e          # Run tests in headless mode
run.bat test e2e:ui       # Run with Playwright UI
run.bat test e2e:ci       # Run in isolated container (CI mode)
```

**Stop the test stack**:
```cmd
run.bat test stack:down
```

**Updating test fixtures**:

Mock Spotify data lives in `tests/fixtures/`. Edit these JSON files to change test data:
- `me.json` - Mock user profile
- `playlists.json` - List of playlists
- `playlist-*.json` - Individual playlist details
- `playlist-*-tracks.json` - Tracks for each playlist

Fixtures are mounted as volumes, so **changes take effect immediately** - no rebuild needed! Just save the file and the mock server will use the updated data on the next request.

## Authentication

This app uses **NextAuth.js** with Spotify OAuth. Sessions persist for 30 days with automatic token refresh. See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for security details.

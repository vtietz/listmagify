# Listmagify

Playlist magic for Spotify. Edit multiple playlists side-by-side with drag-and-drop, bulk operations, and real-time sync.

**🌐 Try it now: [listmagify.com](https://listmagify.com/)**

![Split Editor](public/screenshot-split-editor.png)

## Features

- **Multi-Panel Editor** – Work with multiple playlists simultaneously in split views
- **Drag & Drop** – Move or copy tracks between playlists with visual feedback
- **Bulk Operations** – Select and move/copy/delete multiple tracks at once
- **Smart Search** – Filter tracks instantly by title, artist, or album
- **Compare Mode** – Color-coded visualization showing track distribution across playlists (green = in all, red = unique, yellow = in some)
- **Mobile Optimized** – Fully responsive with touch-friendly controls. Install as PWA for native app experience on phones and tablets
- **Integrated Player** – Preview tracks without leaving the app
- **Last.fm Import** – Import tracks from your Last.fm listening history (loved tracks, top tracks, weekly charts)
- **Liked Songs Browser** – Access your entire library and copy favorites into playlists
- **Track Recommendations** – Get suggestions for your playlists
- **Flexible Sorting** – Sort by position, title, artist, album, duration, or date added
- **Save Sort as Order** – Apply any sort and save it permanently as the new playlist order
- **Playlist Privacy** – Set playlists to public or private from the edit dialog
- **Insert at Markers** – Mark multiple positions across playlists and insert tracks at all marked locations simultaneously
- **Compact Mode** – Dense view to see more tracks on screen
- **Scroll Text** – Auto-scroll overflowing track labels horizontally for better readability. Pause on hover to click links

**Note**: The Spotify API does not support playlist folders. All playlists are displayed in a flat list view.

## Mobile Installation

Listmagify can be installed on your mobile device for a native-like experience:

**iOS (Safari)**:
1. Open the site in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to confirm

**Android (Chrome)**:
1. Open the site in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home Screen" or "Install App"
4. Tap "Install" to confirm

Once installed, the app will:
- Launch in standalone mode (no browser UI)
- Have its own icon on your home screen
- Work offline for previously loaded content
- Provide a native app-like experience

## Production Setup (listmagify.com)

### Option 1: Using Pre-built Images (Recommended)

Images are automatically built and pushed to GitHub Container Registry on every commit to `main`.

1. **Configure Environment Variables**:
   ```env
   NEXTAUTH_URL=https://listmagify.com
   NEXTAUTH_SECRET=your_generated_secret_here
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```

2. **Update Spotify Dashboard**:
   - Add Redirect URI: `https://listmagify.com/api/auth/callback/spotify`

3. **Pull and Run**:
   ```bash
   # Pull the latest pre-built image
   ./run.sh prod-pull

   # Start the container
   ./run.sh prod-up
   ```

   To use a specific version:
   ```bash
   IMAGE=ghcr.io/vtietz/listmagify:main-abc123 ./run.sh prod-up
   ```

4. **Update to Latest**:
   ```bash
   ./run.sh prod-pull && ./run.sh prod-up
   ```

### Option 2: Build Locally

If you need to build with custom modifications:

1. **Configure Environment Variables** (same as above)

2. **Build & Run**:
   ```bash
   # Build the production image
   ./run.sh prod-build

   # Start the container
   ./run.sh prod-up
   ```

3. **Update Workflow**:
   ```bash
   ./run.sh prod-update [--no-cache]
   ```

### GitHub Actions Setup

The repository includes a GitHub Actions workflow that automatically:
- Builds the production Docker image
- Pushes to GitHub Container Registry (ghcr.io)
- Creates tags for each commit and `latest` for main branch

To enable:
1. Go to Settings → Actions → General
2. Under "Workflow permissions", select "Read and write permissions"
3. Save changes

Images will be available at: `ghcr.io/vtietz/listmagify:latest`

## Quick Start (Local)

> **Note:** All commands below use `./run.sh` (Linux/macOS). Windows users can use `run.bat` with identical commands (e.g., `run.bat up` instead of `./run.sh up`).

1. **Set up environment**:
   ```bash
   ./run.sh init-env
   ```

2. **Add Spotify credentials** to `.env`:
   ```
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   NEXTAUTH_SECRET=your_random_secret
   ```

3. **Configure OAuth** in [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
   - Redirect URI: `http://127.0.0.1:3000/api/auth/callback/spotify`

4. **Run**:
   ```bash
   ./run.sh install
   ./run.sh up
   ```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Development

All commands run inside Docker:

| Task | Command |
|------|----------|
| Install dependencies | `./run.sh install` |
| Start dev server | `./run.sh up` |
| Stop dev server | `./run.sh down` |
| Run unit tests | `./run.sh test` |
| Run test in watch mode | `./run.sh test -- --watch` |
| Add package | `./run.sh exec pnpm add <pkg>` |
| Run arbitrary command | `./run.sh exec <cmd>` |
| Run docker compose cmd | `./run.sh compose <cmd>` |

## Production Deployment

Build and run the production image:

```bash
./run.sh prod-build
./run.sh prod-up
```

The production setup includes:
- Optimized Next.js production build
- Persistent metrics database volume
- No test/mock services
- Automatic container restart

### Production Management Commands

| Task | Command |
|------|----------|
| Build production image | `./run.sh prod-build` |
| Start production | `./run.sh prod-up` |
| Stop production | `./run.sh prod-down` |
| View production logs | `./run.sh prod-logs -f` |
| Update (git pull + rebuild) | `./run.sh prod-update [--no-cache]` |
| Cleanup artifacts | `./run.sh prod-clean` |
| Cleanup + volumes | `./run.sh prod-clean --volumes` |

### Cleanup Docker Artifacts

Remove Docker images, containers, and build cache for this app:

```bash
./run.sh prod-clean

# Also remove volumes (deletes database)
./run.sh prod-clean --volumes
```

This cleans up:
- Stopped containers (development and production)
- Docker images (`sbs-web:prod`, `sbs-web:dev`)
- Build cache
- Volumes (when `--volumes` flag is used)

### Server-Specific Configuration (nginx-proxy, Let's Encrypt, etc.)

For production deployments requiring custom networks, SSL certificates, or reverse proxy integration:

1. **Copy the example override file:**
   ```bash
   cp docker/docker-compose.prod.override.example.yml docker/docker-compose.prod.override.yml
   ```

2. **Edit `docker/docker-compose.prod.override.yml` with your server-specific settings:**
   - Custom networks (e.g., `nginx-proxy`)
   - Let's Encrypt environment variables
   - Domain names and SSL configuration
   - Traefik labels (if applicable)

3. **Deploy using both files:**
   ```bash
   # Option 1: Explicit file list
   docker compose -f docker/docker-compose.prod.yml -f docker/docker-compose.prod.override.yml up -d
   
   # Option 2: Set COMPOSE_FILE environment variable
   export COMPOSE_FILE=docker/docker-compose.prod.yml:docker/docker-compose.prod.override.yml
   docker compose up -d
   ```

**Note:** The override file is git-ignored, so it won't be overwritten when pulling updates from the repo.

## Tech Stack

- Next.js 16, React 19, TypeScript
- TanStack Query, TanStack Virtual
- dnd-kit for drag-and-drop
- NextAuth.js for Spotify OAuth
- Tailwind CSS, shadcn/ui
- better-sqlite3 for metrics

## Bring Your Own Key (BYOK)

BYOK allows users to use their own Spotify API credentials for full control over their API access. When enabled, a "Use Your Own API Key" button appears on the landing page.

### Enable BYOK

```env
# .env
BYOK_ENABLED=true
```

### How It Works

1. User clicks "Use Your Own API Key" on the landing page
2. A dialog appears with step-by-step instructions to create a Spotify app
3. User enters their Client ID and Client Secret
4. Credentials are stored in browser localStorage (never sent to server)
5. User clicks "Sign in with Your API Key" to authenticate
6. The app uses their credentials for OAuth and API calls

### User Instructions

Users need to:
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app with these settings:
   - **Redirect URI**: `http://127.0.0.1:3000/api/auth/byok/callback` (or your production URL)
   - **APIs**: Check "Web API"
3. Copy the Client ID and Client Secret into Listmagify

| Variable | Description | Default |
|----------|-------------|---------|
| `BYOK_ENABLED` | Enable/disable BYOK feature | `false` |

**Privacy Note:** User credentials are stored only in their browser's localStorage. They are never transmitted to or stored on the server.

## Access Requests (Optional)

When Listmagify is running in Spotify development mode (limited users), the landing page can show a "Request Access" button that sends an email to the admin with approval instructions.

To enable email delivery, configure SMTP and `CONTACT_EMAIL` in your `.env`.

This feature is disabled by default. To enable it (UI + endpoint), set `ACCESS_REQUEST_ENABLED=true`.

| Variable | Description | Default |
|----------|-------------|---------|
| `ACCESS_REQUEST_ENABLED` | Show "Request Access" on landing and enable `POST /api/access-request` | `false` |

## Usage Analytics (Optional)

Listmagify includes privacy-first usage analytics, disabled by default. When enabled:

- **Privacy**: User IDs are SHA-256 hashed with a salt before storage
- **Local Storage**: All data stored in local SQLite database
- **Retention**: Raw events auto-deleted after 180 days
- **Access Control**: Stats dashboard restricted to allowlisted user IDs
- **Traffic Analytics**: Aggregated page visits, referrers, search queries, and countries (no individual logs)

### Enable Metrics

```env
# .env
STATS_ENABLED=true
STATS_SALT=your-random-secret-salt
STATS_ALLOWED_USER_IDS=your-spotify-user-id
```

| Variable | Description | Default |
|----------|-------------|---------|
| `STATS_ENABLED` | Enable/disable metrics | `false` |
| `STATS_DB_PATH` | SQLite database path | `./data/metrics.db` |
| `STATS_SALT` | Salt for hashing user IDs | `default-salt-change-me` |
| `STATS_ALLOWED_USER_IDS` | Comma-separated Spotify IDs for /stats access | (none) |

## Legal Pages (Imprint & Privacy)

For EU compliance, configure your contact information for the Imprint and Privacy Policy pages:

```env
# .env
CONTACT_NAME=John Doe
CONTACT_STREET=123 Main Street
CONTACT_POSTAL_CODE=12345
CONTACT_CITY=Berlin
CONTACT_COUNTRY=Germany
CONTACT_EMAIL=contact@example.com
```

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTACT_NAME` | Your full legal name | `[Your Full Name]` |
| `CONTACT_STREET` | Street address | `[Street Address]` |
| `CONTACT_POSTAL_CODE` | Postal/ZIP code | `[Postal Code]` |
| `CONTACT_CITY` | City | `[City]` |
| `CONTACT_COUNTRY` | Country | `[Country]` |
| `CONTACT_EMAIL` | Contact email | `[your@email.com]` |

## Error Reporting (Optional)

Allow users to report errors they encounter directly from the app. When an error occurs (e.g., rate limits, API failures), users see a dialog with error details and can optionally send a report.

### Enable Error Reporting

```env
# .env
ERROR_REPORTING_ENABLED=true
CONTACT_EMAIL=your@email.com  # Required for error reports
```

| Variable | Description | Default |
|----------|-------------|---------|
| `ERROR_REPORTING_ENABLED` | Enable error reporting dialog | `false` |
| `CONTACT_EMAIL` | Email for receiving error reports | (required) |

### How It Works

1. When an error occurs, a toast notification appears
2. Click "View Details" to see error information and countdown timers (for rate limits)
3. Add an optional description of what you were doing
4. Click "Send Report" to submit the error report
5. Reports are logged to console (email sending can be configured separately)

**Note:** Error reporting requires `CONTACT_EMAIL` to be configured. Reports include error details, user description, and anonymous environment info (browser, screen size) but no personal data.

## Track Recommendations (Optional)

Listmagify includes a graph-based recommendation system that learns from your playlist organization. When enabled:

- **Local Learning**: Builds a track relationship graph from your playlist patterns
- **No External Data**: All processing happens locally, no data sent externally
- **Two Signals**: Combines sequential adjacency and co-occurrence patterns
- **Context-Aware**: Remembers dismissed recommendations per playlist

### Enable Recommendations

```env
# .env
RECS_ENABLED=true
```

### How It Works

1. Select tracks in the split editor
2. The recommendations panel appears in the Browse panel
3. Drag suggested tracks into your playlists

For detailed documentation, see [docs/RECOMMENDATIONS.md](docs/RECOMMENDATIONS.md).

| Variable | Description | Default |
|----------|-------------|---------|
| `RECS_ENABLED` | Enable/disable recommendations | `false` |
| `RECS_DB_PATH` | SQLite database path | `./data/recs.db` |

## Playlist Auto-Reload (Optional)

Automatically refresh open playlists at a set interval. Useful for collaborative playlists or when multiple users are editing the same playlist.

### Enable Auto-Reload

```env
# .env
PLAYLIST_POLL_INTERVAL_SECONDS=30
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PLAYLIST_POLL_INTERVAL_SECONDS` | Reload interval in seconds | disabled |

**Note:** Liked Songs is excluded from auto-reload. Set to `0` or leave unset to disable.

## Last.fm Import (Optional)

Import tracks from your Last.fm listening history directly into Spotify playlists. Supports recent tracks, loved tracks, top tracks, and weekly charts.

### Get a Last.fm API Key

1. Go to [Last.fm API Account](https://www.last.fm/api/account/create)
2. Sign in with your Last.fm account (or create one)
3. Fill in the application form:
   - **Application name**: e.g., "Listmagify Import"
   - **Application description**: e.g., "Personal playlist editor"
   - **Callback URL**: Leave blank (not needed for API key)
4. Submit and copy your **API Key** (not the shared secret)

### Enable Last.fm Import

```env
# .env
LASTFM_API_KEY=your_lastfm_api_key_here
LASTFM_IMPORT_ENABLED=true
```

| Variable | Description | Default |
|----------|-------------|---------|
| `LASTFM_API_KEY` | Your Last.fm API key | (required) |
| `LASTFM_IMPORT_ENABLED` | Enable/disable import feature | `false` |
| `LASTFM_USER_AGENT` | Custom User-Agent for API requests | `SpotifyPlaylistStudio/1.0` |

### How It Works

1. Open a playlist in the split editor
2. Click the radio icon (📻) in the panel toolbar
3. Enter any Last.fm username (public profiles only)
4. Select source: Recent, Loved, Top, or Weekly tracks
5. Enable "Auto-match to Spotify" for automatic track matching
6. Review matches and select tracks to add
7. Click "Add Selected" to import into your playlist

**Note:** Last.fm import only works with public Last.fm profiles. The feature automatically matches Last.fm tracks to Spotify using artist and track name similarity.

## License

MIT

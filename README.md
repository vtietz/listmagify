# Spotify Playlist Studio

A professional playlist management tool for Spotify. Edit multiple playlists side-by-side with drag-and-drop, bulk operations, and real-time sync.

## Features

- **Multi-Panel Editor** – Work with multiple playlists simultaneously in split views
- **Drag & Drop** – Move or copy tracks between playlists with visual feedback
- **Smart Search** – Filter tracks instantly by title, artist, or album
- **Bulk Operations** – Select and move/copy/delete multiple tracks at once
- **Liked Songs Browser** – Access your entire library and copy favorites into playlists
- **Integrated Player** – Preview tracks without leaving the app
- **Compact Mode** – Dense view to see more tracks on screen

## Quick Start

1. **Set up environment**:
   ```cmd
   run.bat init-env
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
   ```cmd
   run.bat install
   run.bat start
   ```

5. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Development

All commands run inside Docker:

| Command | Description |
|---------|-------------|
| `run.bat install` | Install dependencies |
| `run.bat start` | Start dev server |
| `run.bat test` | Run unit tests |
| `run.bat test e2e` | Run E2E tests |

## Tech Stack

- Next.js 15, React 19, TypeScript
- TanStack Query, TanStack Virtual
- dnd-kit for drag-and-drop
- NextAuth.js for Spotify OAuth
- Tailwind CSS, shadcn/ui

## License

MIT

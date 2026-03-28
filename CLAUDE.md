# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Listmagify is a multi-provider playlist editor (Spotify, TIDAL) built with Next.js 16, React 19, and TypeScript. Users edit multiple playlists side-by-side with drag-and-drop, bulk operations, and real-time sync.

## Development Commands

All development runs inside Docker. Never run `pnpm`, `node`, or `npm` directly on the host.

| Task | Command |
|------|---------|
| Install dependencies | `./run.sh install` |
| Start dev server | `./run.sh up` |
| Stop dev server | `./run.sh down` |
| Run unit tests | `./run.sh test` |
| Run quality checks (lint + typecheck) | `./run.sh quality` |
| Run tests in watch mode | `./run.sh test -- --watch` |
| Run a single test file | `./run.sh exec pnpm vitest --run <path/to/file>.test.ts` |
| Type check | `./run.sh exec pnpm typecheck` |
| Lint | `./run.sh exec pnpm lint` |
| Add a package | `./run.sh exec pnpm add <pkg>` |
| Run arbitrary command | `./run.sh exec <cmd>` |
| E2E tests | `./run.sh test-e2e` |

**Quality gate**: A task is not complete until `./run.sh quality` passes.

## Architecture

### Tech Stack
Next.js 16 (App Router), React 19, TypeScript (strict), TanStack Query + Virtual, Zustand, dnd-kit, NextAuth.js, Tailwind CSS + shadcn/ui, Vitest + Playwright.

### Path Aliases
- `@/*` maps to the project root (e.g., `@/lib/utils` → `./lib/utils`)
- `@features/*` maps to `./features/*` (e.g., `@features/dnd`)
- `@shared/*` maps to `./shared/*` (e.g., `@shared/hooks/useDeviceType`)
- `@widgets/*` maps to `./widgets/*` (e.g., `@widgets/shell`)

### Feature-Sliced Architecture

Code is organized into layers with enforced import boundaries (see `docs/code-organization.md`):
- `features/` — Feature modules: `dnd/`, `split-editor/`, `player/`, `auth/`, `playlists/`
- `shared/` — Generic reusable hooks and UI (no domain knowledge)
- `widgets/` — App-level compositions (shell, layout)
- `lib/` — Domain services, providers, repositories, API clients
- `components/` — UI components (being migrated into features)

Import direction: `shared → features → widgets` (each layer imports from below, never above). Enforced by ESLint `no-restricted-imports` rules.

### Music Provider Abstraction (`lib/music-provider/`)

Provider-neutral interface (`MusicProvider`) with implementations for Spotify and TIDAL. Providers are singletons via `getMusicProvider(providerId)`, feature-flagged by `MUSIC_PROVIDERS` env var.

- `types.ts` — Provider contract and domain types (`Track`, `Playlist`, `PlaybackState`, etc.)
- `spotify/provider.ts` — Spotify provider implementation
- `tidal/provider.ts` — TIDAL provider implementation
- `index.ts` — Provider resolver entry point

Routes depend on the provider boundary; they must not embed provider-specific auth/transport details.

### Auth (`lib/auth/` + `app/api/auth/`)

Multi-provider auth via NextAuth with per-provider tokens stored in JWT under `musicProviderTokens`. Key files:
- `lib/auth/auth.ts` — NextAuth config, JWT callbacks, token refresh
- `lib/auth/tokenManager.ts` — Session/token lifecycle, single-flight refresh
- `lib/providers/authRegistry.ts` — Client-side per-provider auth state (uses `useSyncExternalStore`, not Zustand)
- `app/api/_shared/guard.ts` — `requireAuth()` guard for route handlers

### Split-Editor (`features/split-editor/`)

Tree-based panel layout using immutable `SplitNode` (union of `PanelNode | GroupNode`):
- `features/split-editor/model/tree.ts` — Pure tree operations (split, remove, update, flatten)
- `features/split-editor/stores/useSplitGridStore.ts` — Zustand store for layout state (persisted to localStorage)
- `features/split-editor/playlist/hooks/` — Panel hooks (data source, mutations, selection, sorting, duplicates)
- `features/split-editor/browse/hooks/` — Browse panel hooks (search, lastfm, matching config)
- `components/split-editor/` — Panel rendering, track lists, layout

Each panel has its own `PanelConfig` with `providerId`, `playlistId`, selection, sort, search state.

### State Management

- **Zustand stores** (`features/*/stores/`): Client-side UI state — split grid, player, compare mode, DnD, panel focus, compact mode, insertion points
- **TanStack Query**: Server state — playlists, tracks, search results
- **Composable hooks**: `usePlaylistPanelState()` orchestrates 14+ smaller hooks for panel data, permissions, selection, filtering, mutations

### Drag-and-Drop (`features/dnd/`)

`useDndOrchestrator()` coordinates DnD with handlers in `handlers/dragStart.ts`, `dragOver.ts`, `dragEnd.ts`. Drop intent varies: move, copy, or reorder.

### API Routes (`app/api/`)

Route handlers are orchestrators only: validate input, call services, map errors. Shared utilities in `app/api/_shared/` (guard, provider resolution, HTTP helpers, validation).

Complexity constraints enforced via ESLint: cyclomatic complexity ≤ 12 and max depth ≤ 3 for API routes.

### Testing

- **Unit tests**: Co-located next to modules (`foo.ts` → `foo.test.ts`) — Vitest with jsdom, `@testing-library/react`
- **E2E tests**: `tests/e2e/` — Playwright against Docker mock stack (never real APIs)
- **Setup**: `tests/setup/vitest.setup.ts`
- E2E and unit tests block real Spotify/TIDAL API hosts to fail fast on misconfiguration

## Code Conventions

- No `console.log` — use `console.warn`, `console.error`, or `console.debug`
- Unused variables: prefix with `_` (enforced by ESLint)
- No `@ts-ignore` without clear justification
- File size warning at 500 lines (excluding blanks/comments)
- Commit messages: imperative mood, 50-72 chars
- Service layers should be provider-agnostic where possible

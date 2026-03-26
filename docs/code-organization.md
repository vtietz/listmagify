# Code Organization

This document describes the feature-sliced architecture used in Listmagify.

## Layer Hierarchy

```
widgets/          App-level compositions (shell, layout)
  |
features/         Feature modules (self-contained, domain-specific)
  |
shared/           Generic, reusable utilities (no domain knowledge)
  |
lib/              Domain services, providers, repositories, API clients
  |
components/       UI components not yet migrated into features
```

**Import direction**: Each layer may import from layers below it, never above.

- `shared/` cannot import from `features/` or `widgets/`
- `features/` cannot import from `widgets/`
- `features/` should import other features only via their barrel (`index.ts`), not deep paths
- `widgets/` may import from `features/` and `shared/`

These boundaries are enforced by ESLint (`no-restricted-imports` rules in `eslint.config.mjs`).

## Path Aliases

| Alias | Maps to | Example |
|-------|---------|---------|
| `@/*` | Project root | `@/lib/utils` |
| `@features/*` | `./features/*` | `@features/dnd` |
| `@shared/*` | `./shared/*` | `@shared/hooks/useDeviceType` |
| `@widgets/*` | `./widgets/*` | `@widgets/shell` |

Defined in `tsconfig.json` and mirrored in `vitest.config.ts`.

## Feature Modules (`features/`)

### `features/dnd/`
Drag-and-drop system: handlers, sensors, collision detection, mutations.

```
dnd/
  handlers/       Drag event handlers (dragStart, dragOver, dragEnd)
  model/          State and type definitions
  services/       Mutations and operations
  ui/             DropIndicator
  index.ts        Public barrel
```

### `features/split-editor/`
Split-panel playlist editor: the core UI feature.

```
split-editor/
  model/          SplitNode tree operations, types, persistence
  stores/         Zustand stores (compact mode, compare mode, context menu, split grid)
  hooks/          General hooks (URL sync, virtualizer, mobile marker, auto-scroll)
  playlist/
    hooks/        Playlist panel hooks (panel state, tracks, selection, sorting, mutations)
    ui/           TableHeader, toolbar helpers
  browse/
    hooks/        Browse panel hooks (store, focus, lastfm, matching config)
    ui/           Search panel helpers
  index.ts        Public barrel
```

### `features/player/`
Music playback: Spotify SDK integration, player state, controls.

```
player/
  hooks/          useSpotifyPlayer, useWebPlaybackSDK, useTrackPlayback, usePlayerStore
  ui/             SpotifyPlayer, MiniPlayer, PlaybackControls, PlayerActions, TrackInfo, DeviceSelector
  index.ts        Public barrel
```

### `features/auth/`
Authentication and user identity.

```
auth/
  hooks/          useAuth, useEnsureValidToken, useProviderQueryEnabled, useSessionUser, etc.
  index.ts        Public barrel
```

### `features/playlists/`
Shared playlist logic (not tied to split-editor UI).

```
playlists/
  hooks/          usePlaylistTrackCheck, useRecommendations, useSavedTracksIndex, useLikedTracks
  index.ts        Public barrel
```

## Shared Layer (`shared/`)

Generic, domain-agnostic utilities.

```
shared/
  hooks/          useDebouncedValue, useDeviceType, useTapHandler, useLongPress, etc.
  ui/             ArtworkImage
```

## Widget Layer (`widgets/`)

App-level compositions that orchestrate features.

```
widgets/
  shell/          AppShell, HeaderComponents, config dialog
```

## Where to Place New Code

| Type of code | Location |
|---|---|
| New feature hook | `features/<feature>/hooks/` |
| New feature component | `features/<feature>/ui/` |
| New Zustand store for a feature | `features/<feature>/stores/` |
| Generic reusable hook (no domain knowledge) | `shared/hooks/` |
| Domain service / API client | `lib/` |
| App-level layout / shell | `widgets/` |
| shadcn/ui primitives | `components/ui/` |

## Testing

- **Unit tests**: `tests/unit/` (Vitest with jsdom)
- **E2E tests**: `tests/e2e/` (Playwright against Docker mock)
- Feature barrels can be used in tests: `import { usePlayerStore } from '@features/player'`

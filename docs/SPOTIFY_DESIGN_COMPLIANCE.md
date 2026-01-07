# Spotify Design & Branding Compliance Summary

Last updated: 2026-01-02

This document summarizes the key requirements from Spotify's Design & Branding Guidelines and our current implementation status for each area. Source: https://developer.spotify.com/documentation/design

**Legend:** ✅ Compliant | ⚠️ Partially compliant | ❌ Non-compliant | ➖ Not applicable

---

## Attribution ✅
- Requirements:
  - Always attribute Spotify content (metadata, artwork, playback) with the Spotify brand (logo preferred; icon acceptable only in constrained contexts).
  - Use full logo (icon + wordmark) in partner integrations; comply with logo/color guidelines.
- Current status:
  - ✅ Footer attribution component exists and is used across AppShell pages.
  - ✅ Footer displays full Spotify logo (white in dark mode, black in light mode) at 70px minimum width per guidelines, plus "Content provided by Spotify" link.
  - ✅ Reusable attribution component: [components/ui/spotify-attribution.tsx](../components/ui/spotify-attribution.tsx).

## Using Our Content (artwork, metadata) ✅
- Requirements:
  - Use only Spotify-provided artwork; do not crop, distort, animate, blur, or overlay text/controls on artwork.
  - Round artwork corners: 4px (small/medium devices), 8px (large devices).
  - Keep metadata legible; truncation allowed but users must be able to view the full text.
- Current status:
  - ✅ Artwork: We use Spotify-provided images for playlists/tracks. Corners are rounded via container classes.
  - ✅ No overlays: Controls moved outside artwork area in PlaylistCard: [components/playlist/PlaylistCard.tsx](../components/playlist/PlaylistCard.tsx).
  - ✅ No cropping: Using `object-contain` instead of `object-cover` to preserve full artwork in cards and player.
  - ✅ Metadata: We truncate with `line-clamp` and provide full views in detail/editor pages.

## Browsing Spotify Content (shelves) ➖
- Requirements:
  - Dedicate full rows to Spotify content; avoid placing next to similar services; do not manipulate provided metadata; keep content sets ≤ 20 items with a link to explore more in Spotify.
- Current status:
  - ➖ App is Spotify-only; no mixed-provider shelves. The "≤ 20 items per set" rule applies to shelf-style partner UIs, not our editor views. Not applicable.

## Linking to Spotify ✅
- Requirements:
  - If using Spotify metadata, link back to the Spotify Service.
  - On platforms where the Spotify client exists, link to (or open) the Spotify app; if not installed, link to app store. Use standard CTA text (OPEN SPOTIFY / PLAY ON SPOTIFY / LISTEN ON SPOTIFY or GET SPOTIFY FREE).
- Current status:
  - ✅ Track names link to open.spotify.com with "Open in Spotify ↗" tooltip: [components/split/TrackRow.tsx](../components/split/TrackRow.tsx), [components/playlist/PlaylistTable.tsx](../components/playlist/PlaylistTable.tsx).
  - ✅ Artist/album links in PlaylistTable also open Spotify.
  - ⚠️ No explicit CTA buttons with standard text, but links are clearly accessible. Acceptable for this app type.

## Playing Views ✅
- Requirements:
  - Must attribute with Spotify logo/icon; follow artwork/metadata rules; link to Spotify app when available.
  - Recommendation for companion apps: provide only play/pause; if controls are shown, respect PlaybackRestrictions; seeking bar should be informational only (no seeking) except podcasts/audiobooks (+/− 15s).
- Current status:
  - ✅ Mini player uses Web Playback SDK (primary client experience), so rich controls are expected and acceptable.
  - ✅ Album art uses `object-contain` to avoid cropping, with rounded corners.
  - ✅ **Playback restrictions implemented:** Controls respect `PlaybackRestrictions` flags from Web Playback SDK:
    - Shuffle, Previous, Next, Repeat buttons disabled when restricted (with tooltip).
    - Progress bar is display-only (no seeking) when `restrictions.seeking` is true.
    - Persistent "Some controls restricted — Upgrade to Premium" message shown when any restriction is active.
  - ✅ Implementation: [components/player/SpotifyPlayer.tsx](../components/player/SpotifyPlayer.tsx), [lib/spotify/playerTypes.ts](../lib/spotify/playerTypes.ts).

## Showing Entities (Free tier behaviors, explicit content) ✅
- Requirements:
  - Support on-demand vs shuffle-only layouts for Free tier; display explicit content badges (mandatory in South Korea).
- Current status:
  - ➖ Free-tier specific layouts are not implemented (editor-focused app). Likely not applicable for this app type.
  - ✅ Explicit content badge implemented: "E" badge shown next to explicit tracks in TrackRow and PlaylistTable.

## Using Our Logo ✅
- Requirements:
  - Full logo = icon + wordmark; icon-only only when space constrained or brand already established.
  - Colorways: Green logo on black/white; otherwise use monochrome (black/white). Maintain legibility and exclusion zone.
  - Minimum size: Logo ≥ 70px (digital); icon ≥ 21px.
  - Do not modify, rotate, distort, or place over busy/low-contrast areas.
- Current status:
  - ✅ Using primary logo assets (white/black variants) depending on theme.
  - ✅ Logo rendered at minimum 70px width per guidelines.
  - ✅ Backgrounds are clean; monochrome usage matches guidance.

## Using Our Colors ✅
- Requirements:
  - Spotify Green is the resting brand color; use high-contrast, accessible combinations; do not introduce new colors outside the palette for brand communication.
- Current status:
  - ✅ UI uses Tailwind greens (`text/bg-green-500`) for control states, not for representing Spotify brand.
  - ✅ No misuse of Spotify Green detected in logos/marks.

## Logo and Naming Restrictions ⚠️
- Requirements:
  - App name must not include "Spotify" or sound similar; "for Spotify" phrasing is acceptable.
  - App logo must not include or mimic Spotify brand elements (Spotify Green, circle, waves). No co-branded lockups.
- Current status:
  - ✅ Public-facing app name is "Listmagify" — does not include "Spotify". Compliant.
  - ✅ Internal package name is "listmagify" in [package.json](../package.json), consistent with the branding.
  - ⚠️ Web Playback SDK player name is "Spotify Playlist Editor" in [hooks/useWebPlaybackSDK.ts](../hooks/useWebPlaybackSDK.ts). Consider renaming to "Listmagify".
  - ✅ Our app brand logo (Listmagify) is separate from Spotify logo; no co-branded lockups.

## Fonts ✅
- Requirements:
  - Use the platform default sans-serif; common fallbacks suggested (Helvetica Neue, Helvetica, Arial).
- Current status:
  - ✅ We use Geist font (Google) configured via Next font. This is a recommendation, not a restriction.

---

## Remaining Items (Low Priority)

| Item | Priority | Notes |
|------|----------|-------|
| ~~Rename internal package name~~ | ~~Low~~ | ✅ Completed: "listmagify" in package.json |
| Rename Web Playback SDK player | Low | "Spotify Playlist Editor" → "Listmagify" in useWebPlaybackSDK.ts |
| Artwork corner radii documentation | Low | Currently using rounded classes; could document 4px/8px more explicitly |

---

## Summary Table

| Area | Key Requirements | Status |
|------|------------------|--------|
| Attribution | Show full Spotify logo with content | ✅ Compliant |
| Artwork | No overlays/cropping; rounded corners | ✅ Compliant |
| Metadata | Legible; truncation allowed with full view available | ✅ Compliant |
| Browsing shelves | Dedicated rows; ≤20 items; link to Spotify | ➖ Not applicable |
| Linking | Link back to Spotify; app CTAs where relevant | ✅ Compliant |
| Playing views | Attribution; controls; seek restrictions | ✅ Compliant (Web Playback SDK) |
| Explicit badge | Show explicit tag; mandatory in KR | ✅ Compliant |
| Logos | Correct colorway; min sizes; no misuse | ✅ Compliant |
| Colors | Use brand palette appropriately | ✅ Compliant |
| Naming | No "Spotify" in app name/logo; no co-branding | ⚠️ Internal names only |
| Fonts | Prefer platform defaults | ✅ Compliant |

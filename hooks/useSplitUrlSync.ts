/**
 * URL synchronization hook for split editor layouts.
 * Encodes split tree state into URL query params for sharing/bookmarking.
 * 
 * Only active on /split-editor path to avoid interfering with single playlist route.
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  useSplitGridStore,
  SplitNode,
  PanelNode,
  GroupNode,
  createPanelConfig,
  createPanelNode,
  generateGroupId,
} from './useSplitGridStore';

// ============================================================================
// URL Layout Spec Types (compact schema for URL encoding)
// ============================================================================

/** Compact panel spec for URL encoding */
interface PanelSpec {
  k: 'p';
  p: {
    pl: string | null;  // playlistId
    q?: string;         // searchQuery (optional, omit if empty)
    l?: boolean;        // locked (optional, omit if false)
    m?: 'copy' | 'move'; // dndMode (optional, omit if 'copy')
  };
}

/** Compact group spec for URL encoding */
interface GroupSpec {
  k: 'g';
  o: 'h' | 'v';  // orientation: h = horizontal, v = vertical
  c: LayoutSpec[]; // children
}

/** Union type for layout specs */
type LayoutSpec = PanelSpec | GroupSpec;

// ============================================================================
// Human-Readable URL Format (URL-safe characters)
// ============================================================================
// 
// Format DSL (uses only URL-safe chars that don't get percent-encoded):
//   p.PLAYLIST_ID        - panel with playlist
//   p.                   - empty panel (no playlist)
//   p.ID~q-search~l~m    - panel with options: q-=search, l=locked, m=move mode
//   h_child.child...!    - horizontal group: h_...!
//   v_child.child...!    - vertical group: v_...!
//
// URL-safe substitutions:
//   ( → _   (group start)
//   ) → !   (group end - using ! because - can be in some IDs)
//   , → .   (child separator)
//   : → .   (panel prefix separator)
//   ~ → ~   (flag separator - URL safe)
//
// Examples:
//   p.abc123                           - single panel with playlist abc123
//   h_p.abc.p.def!                     - two panels side by side
//   h_p.abc.v_p.def~l.p.!              - left panel + right column with locked panel and empty panel
//   p.abc~q-rock~l~m                   - panel with search "rock", locked, move mode

/**
 * Encode a SplitNode tree to a human-readable URL string
 */
export function encodeLayout(node: SplitNode): string {
  return nodeToString(node);
}

function nodeToString(node: SplitNode): string {
  if (node.kind === 'panel') {
    return panelToString(node);
  }
  // Group node: h_child.child...! or v_child.child...!
  const prefix = node.orientation === 'horizontal' ? 'h' : 'v';
  const children = node.children.map(nodeToString).join('.');
  return `${prefix}_${children}!`;
}

function panelToString(node: PanelNode): string {
  const { panel } = node;
  let str = `p.${panel.playlistId || ''}`;
  
  // Add optional flags with ~ separator
  const flags: string[] = [];
  if (panel.searchQuery) {
    // Encode search query: use + for spaces, escape ~ with ~~
    const encoded = panel.searchQuery.replace(/~/g, '~~').replace(/ /g, '+');
    flags.push(`q-${encoded}`);
  }
  if (panel.locked) {
    flags.push('l');
  }
  if (panel.dndMode === 'move') {
    flags.push('m');
  }
  
  if (flags.length > 0) {
    str += '~' + flags.join('~');
  }
  
  return str;
}

/**
 * Decode a human-readable URL string back to a SplitNode tree
 * Returns null if parsing fails
 * 
 * URL-safe format:
 *   p.ID~flags      - panel (uses . for prefix, ~ for flags)
 *   h_children!     - horizontal group (uses _ for start, ! for end)
 *   v_children!     - vertical group
 */
export function decodeLayout(encoded: string): SplitNode | null {
  try {
    const result = parseNode(encoded, 0);
    if (!result) return null;
    return result.node;
  } catch {
    return null;
  }
}

interface ParseResult {
  node: SplitNode;
  endIndex: number;
}

function parseNode(str: string, start: number): ParseResult | null {
  if (start >= str.length) return null;
  
  const char = str[start];
  
  // Panel: p.ID or p.ID~flags
  if (char === 'p' && str[start + 1] === '.') {
    return parsePanel(str, start);
  }
  
  // Group: h_...! or v_...!
  if ((char === 'h' || char === 'v') && str[start + 1] === '_') {
    return parseGroup(str, start, char === 'h' ? 'horizontal' : 'vertical');
  }
  
  return null;
}

function parsePanel(str: string, start: number): ParseResult | null {
  // Skip "p."
  let i = start + 2;
  
  // Parse playlist ID - continues until ~, ., or ! 
  let playlistId = '';
  while (i < str.length) {
    const char = str[i];
    // Stop at flag start, child separator, or group end
    if (char === '~' || char === '.' || char === '!') break;
    playlistId += char;
    i++;
  }
  
  // Parse flags if present
  const flags: string[] = [];
  if (str[i] === '~') {
    i++; // skip first ~
    let currentFlag = '';
    while (i < str.length) {
      const char = str[i];
      // Stop at child separator or group end
      if (char === '.' || char === '!') break;
      if (char === '~') {
        // Check for escaped ~~ 
        if (str[i + 1] === '~') {
          currentFlag += '~';
          i += 2;
          continue;
        }
        // Flag separator
        if (currentFlag) flags.push(currentFlag);
        currentFlag = '';
      } else {
        currentFlag += char;
      }
      i++;
    }
    if (currentFlag) flags.push(currentFlag);
  }
  
  // Create panel
  const panel = createPanelConfig(playlistId || null);
  
  // Apply flags
  for (const flag of flags) {
    if (flag.startsWith('q-')) {
      // Decode search query: + for spaces
      const encoded = flag.slice(2);
      panel.searchQuery = encoded.replace(/\+/g, ' ');
    } else if (flag === 'l') {
      panel.locked = true;
    } else if (flag === 'm') {
      panel.dndMode = 'move';
    }
  }
  
  return {
    node: createPanelNode(panel),
    endIndex: i,
  };
}

function parseGroup(str: string, start: number, orientation: 'horizontal' | 'vertical'): ParseResult | null {
  // Skip "h_" or "v_"
  let i = start + 2;
  
  const children: SplitNode[] = [];
  
  while (i < str.length) {
    // Check for end of group
    if (str[i] === '!') {
      i++; // consume closing !
      break;
    }
    
    // Skip child separator
    if (str[i] === '.') {
      i++;
      continue;
    }
    
    // Parse child node
    const result = parseNode(str, i);
    if (!result) return null;
    
    children.push(result.node);
    i = result.endIndex;
  }
  
  const group: GroupNode = {
    kind: 'group',
    id: generateGroupId(),
    orientation,
    children,
  };
  
  return {
    node: group,
    endIndex: i,
  };
}

// ============================================================================
// Legacy Base64 Support (for backwards compatibility)
// ============================================================================

/**
 * Try to decode as legacy Base64 format
 */
function decodeLegacyBase64(encoded: string): SplitNode | null {
  try {
    // Convert from URL-safe format
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }
    const json = decodeURIComponent(escape(atob(base64)));
    const spec = JSON.parse(json) as LayoutSpec;
    return fromLayoutSpec(spec);
  } catch {
    return null;
  }
}

/**
 * Decode layout string - tries new format first, then legacy Base64
 */
export function decodeLayoutWithFallback(encoded: string): SplitNode | null {
  // Try new human-readable format first
  const result = decodeLayout(encoded);
  if (result) return result;
  
  // Fall back to legacy Base64 format
  return decodeLegacyBase64(encoded);
}

// Keep these for tests that use the intermediate spec format
export function toLayoutSpec(node: SplitNode): LayoutSpec {
  if (node.kind === 'panel') {
    const spec: PanelSpec = {
      k: 'p',
      p: {
        pl: node.panel.playlistId,
      },
    };
    if (node.panel.searchQuery) {
      spec.p.q = node.panel.searchQuery;
    }
    if (node.panel.locked) {
      spec.p.l = true;
    }
    if (node.panel.dndMode !== 'copy') {
      spec.p.m = node.panel.dndMode;
    }
    return spec;
  }
  return {
    k: 'g',
    o: node.orientation === 'horizontal' ? 'h' : 'v',
    c: node.children.map(toLayoutSpec),
  };
}

export function fromLayoutSpec(spec: LayoutSpec): SplitNode {
  if (spec.k === 'p') {
    const panel = createPanelConfig(spec.p.pl);
    if (spec.p.q) {
      panel.searchQuery = spec.p.q;
    }
    if (spec.p.l) {
      panel.locked = true;
    }
    if (spec.p.m) {
      panel.dndMode = spec.p.m;
    }
    return createPanelNode(panel);
  }
  const children = spec.c.map(fromLayoutSpec);
  const group: GroupNode = {
    kind: 'group',
    id: generateGroupId(),
    orientation: spec.o === 'h' ? 'horizontal' : 'vertical',
    children,
  };
  return group;
}

// ============================================================================
// URL Sync Hook
// ============================================================================

const DEBOUNCE_MS = 250;

/**
 * Check if the current path supports URL layout sync.
 * Supports: /split-editor and /playlists/[id]
 */
function isLayoutSyncPath(pathname: string): boolean {
  return pathname === '/split-editor' || pathname.startsWith('/playlists/');
}

/**
 * Extract playlist ID from /playlists/[id] path.
 * Returns null for other paths.
 */
function extractPlaylistIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/playlists\/([^/]+)$/);
  return match?.[1] ?? null;
}

/**
 * Check if the layout is just a single panel with the given playlist ID and no special flags.
 * In this case, we don't need a layout param since the route already specifies the playlist.
 */
function isDefaultSinglePanelLayout(root: SplitNode, playlistId: string): boolean {
  if (root.kind !== 'panel') return false;
  const { panel } = root;
  return (
    panel.playlistId === playlistId &&
    !panel.searchQuery &&
    !panel.locked &&
    panel.dndMode === 'copy'
  );
}

/**
 * Hook that synchronizes split grid state with URL query params.
 * - Hydrates state from URL on mount (if layout param present)
 * - Updates URL when state changes (debounced)
 * 
 * Active on /split-editor and /playlists/[id] paths.
 */
export function useSplitUrlSync(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const initializeFromRoot = useSplitGridStore((state) => state.initializeFromRoot);
  
  // Track if we've already hydrated to avoid re-hydrating on URL changes we caused
  const hasHydrated = useRef(false);
  const lastEncodedLayout = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Use ref for pathname to avoid stale closures in subscription callback
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Check if we're on a supported path
  const isSyncEnabled = isLayoutSyncPath(pathname);

  // Hydrate from URL on mount (only if layout param exists)
  useEffect(() => {
    if (!isSyncEnabled || hasHydrated.current) return;

    const layoutParam = searchParams.get('layout');
    if (layoutParam) {
      // Try new format first, then legacy Base64
      const root = decodeLayoutWithFallback(layoutParam);
      if (root) {
        initializeFromRoot(root);
        lastEncodedLayout.current = encodeLayout(root); // Store in new format
      }
      // If decode fails, we just use persisted state (no-op)
    }
    
    hasHydrated.current = true;
  }, [isSyncEnabled, searchParams, initializeFromRoot]);

  // Subscribe to store changes and update URL
  useEffect(() => {
    if (!isSyncEnabled) return;

    const unsubscribe = useSplitGridStore.subscribe((state) => {
      // Double-check we're still on a supported path (pathname could have changed)
      if (!isLayoutSyncPath(pathnameRef.current)) return;

      // Debounce URL updates
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      
      debounceTimer.current = setTimeout(() => {
        // Final check before updating
        if (!isLayoutSyncPath(pathnameRef.current)) return;
        
        // If no root (all panels closed), redirect to playlists page
        if (!state.root) {
          router.replace('/playlists', { scroll: false });
          lastEncodedLayout.current = null;
          return;
        }
        
        // Check if this is a /playlists/[id] route with just the default single panel
        const routePlaylistId = extractPlaylistIdFromPath(pathnameRef.current);
        if (routePlaylistId && isDefaultSinglePanelLayout(state.root, routePlaylistId)) {
          // Don't add layout param - the route already specifies the playlist
          // Remove layout param if it exists
          const params = new URLSearchParams(window.location.search);
          if (params.has('layout')) {
            params.delete('layout');
            const newUrl = params.toString() 
              ? `${pathnameRef.current}?${params.toString()}`
              : pathnameRef.current;
            router.replace(newUrl, { scroll: false });
          }
          lastEncodedLayout.current = null;
          return;
        }
        
        const encoded = encodeLayout(state.root);
        
        // Only update if actually changed
        if (encoded === lastEncodedLayout.current) return;
        lastEncodedLayout.current = encoded;

        // If we're on /playlists/[id] with a non-default layout (multi-panel or different playlist),
        // redirect to /split-editor since the layout contains all the playlist info
        if (routePlaylistId) {
          router.replace(`/split-editor?layout=${encoded}`, { scroll: false });
          return;
        }

        // Build new URL with updated layout param (for /split-editor)
        const params = new URLSearchParams(window.location.search);
        params.set('layout', encoded);
        
        // Use shallow routing to avoid page reload
        router.replace(`${pathnameRef.current}?${params.toString()}`, { scroll: false });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [isSyncEnabled, router]);
}

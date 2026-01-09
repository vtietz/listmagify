import { describe, it, expect } from 'vitest';
import {
  toLayoutSpec,
  fromLayoutSpec,
  encodeLayout,
  decodeLayout,
  decodeLayoutWithFallback,
} from '@/hooks/useSplitUrlSync';
import {
  PanelNode,
  GroupNode,
  createPanelConfig,
  createPanelNode,
  generateGroupId,
} from '@/hooks/useSplitGridStore';

describe('useSplitUrlSync', () => {
  describe('toLayoutSpec', () => {
    it('converts a single panel with null playlistId', () => {
      const panel = createPanelConfig(null);
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      expect(spec).toEqual({
        k: 'p',
        p: { pl: null },
      });
    });

    it('converts a single panel with playlistId', () => {
      const panel = createPanelConfig('playlist-123');
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      expect(spec).toEqual({
        k: 'p',
        p: { pl: 'playlist-123' },
      });
    });

    it('includes searchQuery when non-empty', () => {
      const panel = createPanelConfig('playlist-123');
      panel.searchQuery = 'test query';
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      expect(spec).toEqual({
        k: 'p',
        p: { pl: 'playlist-123', q: 'test query' },
      });
    });

    it('includes locked flag when true', () => {
      const panel = createPanelConfig('playlist-123');
      panel.locked = true;
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      expect(spec).toEqual({
        k: 'p',
        p: { pl: 'playlist-123', l: true },
      });
    });

    it('includes dndMode when not copy', () => {
      const panel = createPanelConfig('playlist-123');
      panel.dndMode = 'move';
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      expect(spec).toEqual({
        k: 'p',
        p: { pl: 'playlist-123', m: 'move' },
      });
    });

    it('converts a horizontal group', () => {
      const panel1 = createPanelConfig('playlist-1');
      const panel2 = createPanelConfig('playlist-2');
      const group: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'horizontal',
        children: [createPanelNode(panel1), createPanelNode(panel2)],
      };

      const spec = toLayoutSpec(group);

      expect(spec).toEqual({
        k: 'g',
        o: 'h',
        c: [
          { k: 'p', p: { pl: 'playlist-1' } },
          { k: 'p', p: { pl: 'playlist-2' } },
        ],
      });
    });

    it('converts a vertical group', () => {
      const panel1 = createPanelConfig('playlist-1');
      const panel2 = createPanelConfig('playlist-2');
      const group: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'vertical',
        children: [createPanelNode(panel1), createPanelNode(panel2)],
      };

      const spec = toLayoutSpec(group);

      expect(spec).toEqual({
        k: 'g',
        o: 'v',
        c: [
          { k: 'p', p: { pl: 'playlist-1' } },
          { k: 'p', p: { pl: 'playlist-2' } },
        ],
      });
    });

    it('converts nested groups', () => {
      const panel1 = createPanelConfig('playlist-1');
      const panel2 = createPanelConfig('playlist-2');
      const panel3 = createPanelConfig('playlist-3');
      
      const innerGroup: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'vertical',
        children: [createPanelNode(panel2), createPanelNode(panel3)],
      };

      const outerGroup: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'horizontal',
        children: [createPanelNode(panel1), innerGroup],
      };

      const spec = toLayoutSpec(outerGroup);

      expect(spec).toEqual({
        k: 'g',
        o: 'h',
        c: [
          { k: 'p', p: { pl: 'playlist-1' } },
          {
            k: 'g',
            o: 'v',
            c: [
              { k: 'p', p: { pl: 'playlist-2' } },
              { k: 'p', p: { pl: 'playlist-3' } },
            ],
          },
        ],
      });
    });
  });

  describe('fromLayoutSpec', () => {
    it('creates a panel from spec with null playlistId', () => {
      const spec = { k: 'p' as const, p: { pl: null } };

      const node = fromLayoutSpec(spec) as PanelNode;

      expect(node.kind).toBe('panel');
      expect(node.panel.playlistId).toBeNull();
      expect(node.panel.id).toBeTruthy(); // Fresh ID generated
    });

    it('creates a panel from spec with playlistId', () => {
      const spec = { k: 'p' as const, p: { pl: 'playlist-abc' } };

      const node = fromLayoutSpec(spec) as PanelNode;

      expect(node.kind).toBe('panel');
      expect(node.panel.playlistId).toBe('playlist-abc');
    });

    it('applies searchQuery from spec', () => {
      const spec = { k: 'p' as const, p: { pl: 'playlist-abc', q: 'search term' } };

      const node = fromLayoutSpec(spec) as PanelNode;

      expect(node.panel.searchQuery).toBe('search term');
    });

    it('applies locked flag from spec', () => {
      const spec = { k: 'p' as const, p: { pl: 'playlist-abc', l: true } };

      const node = fromLayoutSpec(spec) as PanelNode;

      expect(node.panel.locked).toBe(true);
    });

    it('applies dndMode from spec', () => {
      const spec = { k: 'p' as const, p: { pl: 'playlist-abc', m: 'move' as const } };

      const node = fromLayoutSpec(spec) as PanelNode;

      expect(node.panel.dndMode).toBe('move');
    });

    it('creates a horizontal group from spec', () => {
      const spec = {
        k: 'g' as const,
        o: 'h' as const,
        c: [
          { k: 'p' as const, p: { pl: 'playlist-1' } },
          { k: 'p' as const, p: { pl: 'playlist-2' } },
        ],
      };

      const node = fromLayoutSpec(spec) as GroupNode;

      expect(node.kind).toBe('group');
      expect(node.orientation).toBe('horizontal');
      expect(node.children).toHaveLength(2);
      expect((node.children[0] as PanelNode).panel.playlistId).toBe('playlist-1');
      expect((node.children[1] as PanelNode).panel.playlistId).toBe('playlist-2');
    });

    it('creates a vertical group from spec', () => {
      const spec = {
        k: 'g' as const,
        o: 'v' as const,
        c: [
          { k: 'p' as const, p: { pl: 'playlist-1' } },
          { k: 'p' as const, p: { pl: 'playlist-2' } },
        ],
      };

      const node = fromLayoutSpec(spec) as GroupNode;

      expect(node.kind).toBe('group');
      expect(node.orientation).toBe('vertical');
    });

    it('creates nested groups from spec', () => {
      const spec = {
        k: 'g' as const,
        o: 'h' as const,
        c: [
          { k: 'p' as const, p: { pl: 'playlist-1' } },
          {
            k: 'g' as const,
            o: 'v' as const,
            c: [
              { k: 'p' as const, p: { pl: 'playlist-2' } },
              { k: 'p' as const, p: { pl: 'playlist-3' } },
            ],
          },
        ],
      };

      const node = fromLayoutSpec(spec) as GroupNode;

      expect(node.kind).toBe('group');
      expect(node.orientation).toBe('horizontal');
      expect(node.children).toHaveLength(2);
      
      const innerGroup = node.children[1] as GroupNode;
      expect(innerGroup.kind).toBe('group');
      expect(innerGroup.orientation).toBe('vertical');
      expect(innerGroup.children).toHaveLength(2);
    });
  });

  describe('encodeLayout and decodeLayout round-trip', () => {
    it('round-trips a single panel', () => {
      const panel = createPanelConfig('my-playlist');
      const node = createPanelNode(panel);

      const encoded = encodeLayout(node);
      const decoded = decodeLayout(encoded) as PanelNode;

      expect(decoded.kind).toBe('panel');
      expect(decoded.panel.playlistId).toBe('my-playlist');
      // IDs should be different (regenerated)
      expect(decoded.panel.id).not.toBe(panel.id);
    });

    it('round-trips a panel with all optional fields', () => {
      const panel = createPanelConfig('my-playlist');
      panel.searchQuery = 'search term';
      panel.locked = true;
      panel.dndMode = 'move';
      const node = createPanelNode(panel);

      const encoded = encodeLayout(node);
      const decoded = decodeLayout(encoded) as PanelNode;

      expect(decoded.panel.playlistId).toBe('my-playlist');
      expect(decoded.panel.searchQuery).toBe('search term');
      expect(decoded.panel.locked).toBe(true);
      expect(decoded.panel.dndMode).toBe('move');
    });

    it('round-trips a complex nested layout', () => {
      // Create a layout: horizontal group containing [panel-1, vertical group [panel-2, panel-3]]
      const panel1 = createPanelConfig('playlist-1');
      panel1.searchQuery = 'filter1';
      
      const panel2 = createPanelConfig('playlist-2');
      panel2.locked = true;
      
      const panel3 = createPanelConfig(null); // Empty panel
      panel3.dndMode = 'move';

      const innerGroup: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'vertical',
        children: [createPanelNode(panel2), createPanelNode(panel3)],
      };

      const outerGroup: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'horizontal',
        children: [createPanelNode(panel1), innerGroup],
      };

      const encoded = encodeLayout(outerGroup);
      const decoded = decodeLayout(encoded) as GroupNode;

      // Verify structure
      expect(decoded.kind).toBe('group');
      expect(decoded.orientation).toBe('horizontal');
      expect(decoded.children).toHaveLength(2);

      // Check first panel
      const decodedPanel1 = decoded.children[0] as PanelNode;
      expect(decodedPanel1.panel.playlistId).toBe('playlist-1');
      expect(decodedPanel1.panel.searchQuery).toBe('filter1');

      // Check inner group
      const decodedInnerGroup = decoded.children[1] as GroupNode;
      expect(decodedInnerGroup.kind).toBe('group');
      expect(decodedInnerGroup.orientation).toBe('vertical');
      expect(decodedInnerGroup.children).toHaveLength(2);

      // Check panel 2
      const decodedPanel2 = decodedInnerGroup.children[0] as PanelNode;
      expect(decodedPanel2.panel.playlistId).toBe('playlist-2');
      expect(decodedPanel2.panel.locked).toBe(true);

      // Check panel 3
      const decodedPanel3 = decodedInnerGroup.children[1] as PanelNode;
      expect(decodedPanel3.panel.playlistId).toBeNull();
      expect(decodedPanel3.panel.dndMode).toBe('move');
    });

    it('generates human-readable encoded strings', () => {
      const panel = createPanelConfig('playlist-abc123');
      const node = createPanelNode(panel);

      const encoded = encodeLayout(node);

      // Should be human-readable URL-safe format
      expect(encoded).toBe('p.playlist-abc123');
    });

    it('generates readable nested layout strings', () => {
      const panel1 = createPanelConfig('abc');
      const panel2 = createPanelConfig('def');
      const group: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'horizontal',
        children: [createPanelNode(panel1), createPanelNode(panel2)],
      };

      const encoded = encodeLayout(group);
      expect(encoded).toBe('h_p.abc.p.def!');
    });

    it('encodes panel flags correctly', () => {
      const panel = createPanelConfig('abc');
      panel.searchQuery = 'rock';
      panel.locked = true;
      panel.dndMode = 'move';
      const node = createPanelNode(panel);

      const encoded = encodeLayout(node);
      expect(encoded).toBe('p.abc~q-rock~l~m');
    });
  });

  describe('decodeLayout error handling', () => {
    it('returns null for completely invalid format', () => {
      const result = decodeLayout('totally invalid!!!');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = decodeLayout('');
      expect(result).toBeNull();
    });

    it('returns null for unknown node type', () => {
      const result = decodeLayout('x.abc');  // x is not a valid node type
      expect(result).toBeNull();
    });
  });

  describe('legacy Base64 fallback', () => {
    it('decodes legacy Base64 format', () => {
      // Base64 encoded: {"k":"p","p":{"pl":"test-playlist"}}
      const legacyEncoded = 'eyJrIjoicCIsInAiOnsicGwiOiJ0ZXN0LXBsYXlsaXN0In19';
      
      const result = decodeLayoutWithFallback(legacyEncoded) as PanelNode;
      
      expect(result).not.toBeNull();
      expect(result.kind).toBe('panel');
      expect(result.panel.playlistId).toBe('test-playlist');
    });

    it('prefers new format over legacy', () => {
      const newFormat = 'p.my-playlist';
      
      const result = decodeLayoutWithFallback(newFormat) as PanelNode;
      
      expect(result.panel.playlistId).toBe('my-playlist');
    });
  });

  describe('excludes ephemeral state', () => {
    it('does not include selection in encoded output', () => {
      const panel = createPanelConfig('my-playlist');
      panel.selection = new Set(['track-1', 'track-2']);
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      // Selection should not be in the spec
      expect((spec as { p: Record<string, unknown> }).p).not.toHaveProperty('selection');
    });

    it('does not include scrollOffset in encoded output', () => {
      const panel = createPanelConfig('my-playlist');
      panel.scrollOffset = 500;
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      // scrollOffset should not be in the spec
      expect((spec as { p: Record<string, unknown> }).p).not.toHaveProperty('scrollOffset');
    });

    it('does not include isEditable in encoded output', () => {
      const panel = createPanelConfig('my-playlist');
      panel.isEditable = true;
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      // isEditable should not be in the spec
      expect((spec as { p: Record<string, unknown> }).p).not.toHaveProperty('isEditable');
    });

    it('does not include panel IDs in encoded output', () => {
      const panel = createPanelConfig('my-playlist');
      const node = createPanelNode(panel);

      const spec = toLayoutSpec(node);

      // ID should not be in the spec
      expect((spec as { p: Record<string, unknown> }).p).not.toHaveProperty('id');
    });

    it('does not include group IDs in encoded output', () => {
      const panel1 = createPanelConfig('playlist-1');
      const panel2 = createPanelConfig('playlist-2');
      const group: GroupNode = {
        kind: 'group',
        id: generateGroupId(),
        orientation: 'horizontal',
        children: [createPanelNode(panel1), createPanelNode(panel2)],
      };

      const spec = toLayoutSpec(group);

      // ID should not be in the spec
      expect(spec).not.toHaveProperty('id');
    });
  });
});

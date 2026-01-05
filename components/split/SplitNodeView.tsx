/**
 * Recursive component for rendering split tree nodes.
 * - GroupNode: renders a grid container with children
 * - PanelNode: renders a PlaylistPanel
 */

'use client';

import type { SplitNode } from '@/hooks/useSplitGridStore';
import { PlaylistPanel } from './PlaylistPanel';
import type { Track } from '@/lib/spotify/types';
import type { Virtualizer } from '@tanstack/react-virtual';

interface SplitNodeViewProps {
  node: SplitNode;
  onRegisterVirtualizer:
    | ((
        panelId: string,
        virtualizer: Virtualizer<HTMLDivElement, Element>,
        scrollRef: { current: HTMLDivElement | null },
        filteredTracks: Track[],
        canDrop: boolean
      ) => void)
    | undefined;
  onUnregisterVirtualizer: ((panelId: string) => void) | undefined;
  activePanelId: string | null;
  sourcePanelId: string | null;
  dropIndicatorIndex: number | null;
  ephemeralInsertion: {
    activeId: string;
    sourcePanelId: string;
    targetPanelId: string;
    insertionIndex: number;
  } | null;
}

export function SplitNodeView({
  node,
  onRegisterVirtualizer,
  onUnregisterVirtualizer,
  activePanelId,
  sourcePanelId,
  dropIndicatorIndex,
  ephemeralInsertion,
}: SplitNodeViewProps) {
  if (node.kind === 'panel') {
    // Leaf node - render PlaylistPanel
    return (
      <div className="min-h-0 min-w-0 h-full">
        <PlaylistPanel
          panelId={node.panel.id}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
          isActiveDropTarget={activePanelId === node.panel.id}
          isDragSource={sourcePanelId === node.panel.id}
          dropIndicatorIndex={
            // Only show drop indicator in the panel being hovered (target), not in source panel
            activePanelId === node.panel.id ? dropIndicatorIndex : null
          }
          ephemeralInsertion={ephemeralInsertion}
        />
      </div>
    );
  }

  // Group node - render grid container with children
  const isHorizontal = node.orientation === 'horizontal';
  
  return (
    <div
      className="h-full w-full min-h-0 min-w-0"
      style={{
        display: 'grid',
        // horizontal = side by side (columns), vertical = stacked (rows)
        gridTemplateColumns: isHorizontal
          ? `repeat(${node.children.length}, 1fr)`
          : '1fr',
        gridTemplateRows: isHorizontal
          ? '1fr'
          : `repeat(${node.children.length}, 1fr)`,
        gap: '0.5rem',
      }}
    >
      {node.children.map((child) => (
        <SplitNodeView
          key={child.kind === 'panel' ? child.panel.id : child.id}
          node={child}
          onRegisterVirtualizer={onRegisterVirtualizer}
          onUnregisterVirtualizer={onUnregisterVirtualizer}
          activePanelId={activePanelId}
          sourcePanelId={sourcePanelId}
          dropIndicatorIndex={dropIndicatorIndex}
          ephemeralInsertion={ephemeralInsertion}
        />
      ))}
    </div>
  );
}

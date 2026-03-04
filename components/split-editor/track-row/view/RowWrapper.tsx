import type * as React from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

interface RowWrapperProps {
  setNodeRef: (element: HTMLElement | null) => void;
  style: React.CSSProperties;
  className: string;
  id: string;
  isSelected: boolean;
  title: string;
  locked: boolean;
  handleOnlyDrag: boolean;
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  longPressTouchHandlers?: React.HTMLAttributes<HTMLDivElement>;
  showHandle: boolean;
  children: React.ReactNode;
}

export function RowWrapper({
  setNodeRef,
  style,
  className,
  id,
  isSelected,
  title,
  locked,
  handleOnlyDrag,
  dragAttributes,
  dragListeners,
  onClick,
  onMouseDown,
  onMouseMove,
  onMouseLeave,
  onContextMenu,
  longPressTouchHandlers,
  showHandle,
  children,
}: RowWrapperProps) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      id={id}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      aria-selected={isSelected}
      title={title}
      {...(!locked && !handleOnlyDrag ? { ...dragAttributes, ...dragListeners } : { ...dragAttributes })}
      {...(showHandle ? longPressTouchHandlers : {})}
    >
      {children}
    </div>
  );
}

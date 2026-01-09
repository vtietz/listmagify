"use client";

import type { Track } from "@/lib/spotify/types";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";

export type SortKey = 
  | "position" 
  | "title" 
  | "artist" 
  | "album" 
  | "duration" 
  | "addedAt";
export type SortDirection = "asc" | "desc";

export interface PlaylistTableProps {
  tracks: Track[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  isReordering: boolean;
  disabled?: boolean;
}

interface SortableRowProps {
  track: Track;
  index: number;
  isDragEnabled: boolean;
}

/**
 * Individual sortable row with drag handle (only visible when position sort is active).
 */
function SortableRow({ track, index, isDragEnabled }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: track.uri,
    disabled: !isDragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b hover:bg-muted/50 ${isDragging ? "shadow-lg z-10" : ""}`}
    >
      <td className="py-2 px-4 text-sm text-muted-foreground text-right w-16">
        {isDragEnabled ? (
          <button
            className="inline-flex items-center justify-center p-1 rounded hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder track ${index + 1}: ${track.name}`}
            tabIndex={0}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1">{index + 1}</span>
          </button>
        ) : (
          <span>{index + 1}</span>
        )}
      </td>
      <td className="py-2 px-4">
        <div className="font-medium flex items-center gap-1.5">
          {/* Explicit content badge per Spotify guidelines */}
          {track.explicit && (
            <span 
              className="shrink-0 inline-flex items-center justify-center rounded text-[9px] font-bold px-1.5 h-4 bg-muted-foreground/20 text-muted-foreground"
              title="Explicit content"
              aria-label="Explicit"
            >
              E
            </span>
          )}
          {track.id ? (
            <a
              href={`https://open.spotify.com/track/${track.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-green-500"
              title={`Open in Spotify ↗`}
            >
              {track.name}
            </a>
          ) : (
            track.name
          )}
        </div>
      </td>
      <td className="py-2 px-4 text-sm text-muted-foreground">
        {track.artistObjects && track.artistObjects.length > 0 ? (
          track.artistObjects.map((artist, idx) => (
            <span key={artist.id || artist.name}>
              {artist.id ? (
                <a
                  href={`https://open.spotify.com/artist/${artist.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-green-500"
                >
                  {artist.name}
                </a>
              ) : (
                artist.name
              )}
              {idx < track.artistObjects!.length - 1 && ', '}
            </span>
          ))
        ) : (
          track.artists.join(", ") || "—"
        )}
      </td>
      <td className="py-2 px-4 text-sm text-muted-foreground">
        {track.album?.name ? (
          track.album.id ? (
            <a
              href={`https://open.spotify.com/album/${track.album.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-green-500"
            >
              {track.album.name}
            </a>
          ) : (
            track.album.name
          )
        ) : (
          "—"
        )}
      </td>
      <td className="py-2 px-4 text-sm text-muted-foreground text-right">
        {formatDuration(track.durationMs)}
      </td>
      <td className="py-2 px-4 text-sm text-muted-foreground">
        {formatDate(track.addedAt)}
      </td>
    </tr>
  );
}

interface ColumnHeaderProps {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentDirection: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}

/**
 * Sortable column header with indicator.
 */
function ColumnHeader({
  label,
  sortKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = "left",
}: ColumnHeaderProps) {
  const isActive = currentSortKey === sortKey;
  const textAlign = align === "right" ? "text-right" : "text-left";

  return (
    <th className={`py-2 px-4 ${textAlign}`}>
      <button
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-semibold text-sm hover:text-foreground focus:outline-none focus:underline"
        aria-label={`Sort by ${label}`}
        aria-pressed={isActive}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${isActive ? "opacity-100" : "opacity-30"}`}
          aria-hidden="true"
        />
        {isActive && (
          <span className="sr-only">
            {currentDirection === "asc" ? "ascending" : "descending"}
          </span>
        )}
      </button>
    </th>
  );
}

/**
 * Playlist table with sortable columns and drag-and-drop reordering.
 * 
 * Features:
 * - Sortable columns: position, title, artist, album, duration, added at
 * - Drag-and-drop only enabled when sorting by position
 * - Keyboard accessible drag handles
 * - Stable sort with visual indicators
 * - Responsive design
 */
export function PlaylistTable({
  tracks,
  sortKey,
  sortDirection,
  onSortChange,
  onReorder,
  isReordering,
  disabled = false,
}: PlaylistTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const isDragEnabled = sortKey === "position" && !disabled && !isReordering;

  const items = useMemo(
    () => tracks.map((t) => t.uri),
    [tracks]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.indexOf(active.id as string);
    const newIndex = items.indexOf(over.id as string);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex);
    }
  };

  if (tracks.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No tracks found
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Aria live region for announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isReordering && "Reordering track..."}
      </div>

      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <table className="w-full">
              <thead className="border-b">
                <tr>
                  <ColumnHeader
                    label="#"
                    sortKey="position"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                    align="right"
                  />
                  <ColumnHeader
                    label="Title"
                    sortKey="title"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                  />
                  <ColumnHeader
                    label="Artist"
                    sortKey="artist"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                  />
                  <ColumnHeader
                    label="Album"
                    sortKey="album"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                  />
                  <ColumnHeader
                    label="Duration"
                    sortKey="duration"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                    align="right"
                  />
                  <ColumnHeader
                    label="Added"
                    sortKey="addedAt"
                    currentSortKey={sortKey}
                    currentDirection={sortDirection}
                    onSort={onSortChange}
                  />
                </tr>
              </thead>
              <tbody>
                {tracks.map((track, index) => (
                  <SortableRow
                    key={track.uri}
                    track={track}
                    index={index}
                    isDragEnabled={isDragEnabled}
                  />
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>

      {isReordering && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
          <div className="text-sm text-muted-foreground">Saving...</div>
        </div>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import { TRACK_GRID_CLASSES, TRACK_GRID_CLASSES_COMPACT, TRACK_GRID_CLASSES_NORMAL } from '../TableHeader';

interface BuildRowClassNamesInput {
  compareColor: string | undefined;
  isSelected: boolean;
  isAnyDuplicate: boolean;
  isDuplicate: boolean;
  isSoftDuplicate: boolean;
  isOtherInstanceSelected: boolean;
  isCompact: boolean;
  isDragging: boolean;
  isDragSourceSelected: boolean;
  dndMode: 'copy' | 'move';
}

function getDuplicateClasses(isSelected: boolean, isDuplicate: boolean, isOtherInstanceSelected: boolean): string {
  if (!isDuplicate) return '';
  if (isSelected) return 'bg-orange-500/30 text-foreground hover:bg-orange-500/40';
  if (isOtherInstanceSelected) return 'bg-orange-500/20 hover:bg-orange-500/30';
  return 'bg-orange-500/10 hover:bg-orange-500/15';
}

function getSoftDuplicateClasses(isSelected: boolean, isSoftDuplicate: boolean, isDuplicate: boolean): string {
  if (!isSoftDuplicate || isDuplicate) return '';
  if (isSelected) return 'bg-amber-500/20 text-foreground hover:bg-amber-500/25';
  return 'bg-amber-500/5 hover:bg-amber-500/10';
}

function getSelectionBgClass(isSelected: boolean, isAnyDuplicate: boolean, compareColor: string | undefined): string {
  if (isAnyDuplicate) return '';
  if (isSelected) return 'bg-accent/55 text-foreground hover:bg-accent/65 ring-1 ring-inset ring-orange-700/30';
  if (!compareColor || compareColor === 'transparent') return 'hover:bg-accent/40 hover:text-foreground';
  return '';
}

function getDragClass(isDragging: boolean, isDragSourceSelected: boolean, dndMode: 'copy' | 'move'): string {
  if (!isDragging && !isDragSourceSelected) return '';
  if (dndMode === 'move') return 'opacity-0';
  return 'opacity-50';
}

export function buildRowClassNames({
  compareColor,
  isSelected,
  isAnyDuplicate,
  isDuplicate,
  isSoftDuplicate,
  isOtherInstanceSelected,
  isCompact,
  isDragging,
  isDragSourceSelected,
  dndMode,
}: BuildRowClassNamesInput) {
  return cn(
    'relative group/row cursor-default',
    !compareColor || compareColor === 'transparent' || isSelected || isAnyDuplicate ? 'bg-card' : '',
    TRACK_GRID_CLASSES,
    isCompact ? `h-7 ${TRACK_GRID_CLASSES_COMPACT}` : `h-10 ${TRACK_GRID_CLASSES_NORMAL}`,
    'border-b border-border transition-colors',
    getDuplicateClasses(isSelected, isDuplicate, isOtherInstanceSelected),
    getSoftDuplicateClasses(isSelected, isSoftDuplicate, isDuplicate),
    getSelectionBgClass(isSelected, isAnyDuplicate, compareColor),
    getDragClass(isDragging, isDragSourceSelected, dndMode),
  );
}

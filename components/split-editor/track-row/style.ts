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
    isSelected && isDuplicate && 'bg-orange-500/30 text-foreground hover:bg-orange-500/40',
    !isSelected && isDuplicate && isOtherInstanceSelected && 'bg-orange-500/20 hover:bg-orange-500/30',
    !isSelected && isDuplicate && !isOtherInstanceSelected && 'bg-orange-500/10 hover:bg-orange-500/15',
    isSelected && isSoftDuplicate && !isDuplicate && 'bg-amber-500/20 text-foreground hover:bg-amber-500/25',
    !isSelected && isSoftDuplicate && !isDuplicate && 'bg-amber-500/5 hover:bg-amber-500/10',
    isSelected && !isAnyDuplicate && 'bg-accent/70 text-foreground hover:bg-accent/80',
    !isSelected && !isAnyDuplicate && (!compareColor || compareColor === 'transparent') && 'hover:bg-accent/40 hover:text-foreground',
    (isDragging || isDragSourceSelected) && dndMode === 'move' && 'opacity-0',
    (isDragging || isDragSourceSelected) && dndMode === 'copy' && 'opacity-50',
  );
}

/**
 * Move-based playlist reordering. Moving entries in place keeps their "added at"
 * dates, unlike replacing the whole playlist.
 */

export interface ReorderMove {
  /** Index of the entry to move, in the playlist before this move */
  fromIndex: number;
  /** Insert before this index, in the playlist before this move (insert_before semantics) */
  toIndex: number;
}

/**
 * Desired order as indices into the current entries. Entries are placed by the
 * rank of their key; the sort is stable, so duplicates stay together and entries
 * without a rank keep their relative order at the end.
 */
export function buildReorderedIndices(
  currentKeys: ReadonlyArray<string | undefined>,
  desiredKeyOrder: readonly string[],
): number[] {
  const rank = new Map<string, number>();
  desiredKeyOrder.forEach((key, index) => {
    if (!rank.has(key)) rank.set(key, index);
  });

  const unranked = Number.MAX_SAFE_INTEGER;
  return currentKeys
    .map((key, index) => ({ index, rank: (key !== undefined ? rank.get(key) : undefined) ?? unranked }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.index);
}

/** Indices (into `sequence`) of one longest strictly increasing subsequence. */
function longestIncreasingSubsequence(sequence: readonly number[]): Set<number> {
  const tailValues: number[] = [];
  const tailIndices: number[] = [];
  const previous: number[] = new Array<number>(sequence.length).fill(-1);

  sequence.forEach((value, index) => {
    let low = 0;
    let high = tailValues.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (tailValues[mid]! < value) low = mid + 1;
      else high = mid;
    }
    tailValues[low] = value;
    tailIndices[low] = index;
    previous[index] = low > 0 ? tailIndices[low - 1]! : -1;
  });

  const result = new Set<number>();
  let cursor = tailIndices.length > 0 ? tailIndices[tailIndices.length - 1]! : -1;
  while (cursor !== -1) {
    result.add(cursor);
    cursor = previous[cursor]!;
  }
  return result;
}

/**
 * The fewest single-entry moves that turn the current order into `desiredOrder`
 * (a permutation of current indices). Entries on a longest already-ordered run
 * stay put; every other entry is moved right behind its desired predecessor.
 */
export function planReorderMoves(desiredOrder: readonly number[]): ReorderMove[] {
  // Desired position of each current entry, in current order.
  const desiredPosition = new Array<number>(desiredOrder.length);
  desiredOrder.forEach((currentIndex, position) => {
    desiredPosition[currentIndex] = position;
  });
  const stayingCurrentIndices = longestIncreasingSubsequence(desiredPosition);

  const working = desiredOrder.map((_, index) => index);
  const moves: ReorderMove[] = [];

  desiredOrder.forEach((entry, position) => {
    if (stayingCurrentIndices.has(entry)) return;

    const fromIndex = working.indexOf(entry);
    const toIndex = position === 0 ? 0 : working.indexOf(desiredOrder[position - 1]!) + 1;
    if (toIndex === fromIndex || toIndex === fromIndex + 1) return;

    moves.push({ fromIndex, toIndex });
    working.splice(fromIndex, 1);
    working.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, entry);
  });

  return moves;
}

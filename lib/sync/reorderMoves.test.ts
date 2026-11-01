import { describe, expect, it } from 'vitest';
import { buildReorderedIndices, planReorderMoves, type ReorderMove } from '@/lib/sync/reorderMoves';

/** Applies moves with Spotify / TIDAL insert_before semantics. */
function applyMoves<T>(items: T[], moves: ReorderMove[]): T[] {
  const result = [...items];
  for (const { fromIndex, toIndex } of moves) {
    const [moved] = result.splice(fromIndex, 1);
    result.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved!);
  }
  return result;
}

function shuffled(length: number, seed: number): number[] {
  const values = Array.from({ length }, (_, i) => i);
  let state = seed;
  for (let i = values.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

describe('buildReorderedIndices', () => {
  it('sorts by desired key order, keeping duplicates together and unknown entries last', () => {
    expect(buildReorderedIndices(['b', undefined, 'a', 'b'], ['a', 'b'])).toEqual([2, 0, 3, 1]);
  });
});

describe('planReorderMoves', () => {
  it('needs no moves when the order is already right', () => {
    expect(planReorderMoves([0, 1, 2, 3])).toEqual([]);
  });

  it('moves a single new track from the end into place with one move', () => {
    // Current: a b c n  -> desired: a n b c
    const moves = planReorderMoves([0, 3, 1, 2]);

    expect(moves).toEqual([{ fromIndex: 3, toIndex: 1 }]);
    expect(applyMoves(['a', 'b', 'c', 'n'], moves)).toEqual(['a', 'n', 'b', 'c']);
  });

  it('moves only the entries off the longest ordered run', () => {
    const desired = [4, 0, 1, 2, 3];
    const moves = planReorderMoves(desired);

    expect(moves).toHaveLength(1);
    expect(applyMoves([0, 1, 2, 3, 4], moves)).toEqual(desired);
  });

  it('always produces the desired order', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const length = (seed % 17) + 1;
      const desired = shuffled(length, seed);
      const current = Array.from({ length }, (_, i) => i);

      expect(applyMoves(current, planReorderMoves(desired))).toEqual(desired);
    }
  });
});

import type { PieceType, Rotation } from './types';

/**
 * Per-piece, per-rotation cell offsets as (x, y) within the piece bounding box.
 * Bounding box is 4x4 for I, 2x2 for O, 3x3 for the rest.
 * Order of rotations: 0 (spawn), 1 (R = CW), 2 (180), 3 (L = CCW).
 */
export const SHAPES: Record<PieceType, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]], // 0
    [[2, 0], [2, 1], [2, 2], [2, 3]], // R
    [[0, 2], [1, 2], [2, 2], [3, 2]], // 2
    [[1, 0], [1, 1], [1, 2], [1, 3]], // L
  ],
  O: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]], // 0 (up)
    [[1, 0], [1, 1], [2, 1], [1, 2]], // R (right)
    [[0, 1], [1, 1], [2, 1], [1, 2]], // 2 (down)
    [[1, 0], [0, 1], [1, 1], [1, 2]], // L (left)
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]], // 0
    [[1, 0], [1, 1], [2, 1], [2, 2]], // R
    [[1, 1], [2, 1], [0, 2], [1, 2]], // 2
    [[0, 0], [0, 1], [1, 1], [1, 2]], // L
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]], // 0
    [[2, 0], [1, 1], [2, 1], [1, 2]], // R
    [[0, 1], [1, 1], [1, 2], [2, 2]], // 2
    [[1, 0], [0, 1], [1, 1], [0, 2]], // L
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]], // 0
    [[1, 0], [2, 0], [1, 1], [1, 2]], // R
    [[0, 1], [1, 1], [2, 1], [2, 2]], // 2
    [[1, 0], [1, 1], [0, 2], [1, 2]], // L
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]], // 0
    [[1, 0], [1, 1], [1, 2], [2, 2]], // R
    [[0, 1], [1, 1], [2, 1], [0, 2]], // 2
    [[0, 0], [1, 0], [1, 1], [1, 2]], // L
  ],
};

/** Spawn bounding-box top-left (x, y) for each piece. */
export const SPAWN_POS: Record<PieceType, readonly [number, number]> = {
  I: [3, 18],
  O: [4, 19],
  T: [3, 19],
  S: [3, 19],
  Z: [3, 19],
  J: [3, 19],
  L: [3, 19],
};

/** Returns absolute grid cells (x, y) for a piece at the given pos+rotation. */
export function pieceCells(
  type: PieceType,
  rotation: Rotation,
  x: number,
  y: number,
): [number, number][] {
  const shape = SHAPES[type][rotation];
  const out: [number, number][] = [];
  for (const [ox, oy] of shape) out.push([x + ox, y + oy]);
  return out;
}

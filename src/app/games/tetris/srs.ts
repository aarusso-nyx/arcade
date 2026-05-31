import { collides } from './board';
import { pieceCells } from './pieces';
import type { ActivePiece, Grid, Rotation } from './types';

/**
 * SRS wall-kick offsets, written in the conventional "y up positive" form.
 * Apply with x += dx, y -= dy because our grid is y-down.
 */
type KickTable = ReadonlyArray<readonly (readonly [number, number])[]>;

// Indexed by `fromState * 4 + toState`. Only valid transitions (CW, CCW, 180) populated.
// Spec table format: (dx, dy) with y-up positive.

// J L S T Z
export const KICK_JLSTZ: Record<string, readonly (readonly [number, number])[]> = {
  '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

// I piece
export const KICK_I: Record<string, readonly (readonly [number, number])[]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// O piece has no kicks; identity test only.
const KICK_O: readonly (readonly [number, number])[] = [[0, 0]];

export type RotationDirection = 'CW' | 'CCW' | '180';

export function nextRotation(from: Rotation, dir: RotationDirection): Rotation {
  if (dir === 'CW') return ((from + 1) & 3) as Rotation;
  if (dir === 'CCW') return ((from + 3) & 3) as Rotation;
  return ((from + 2) & 3) as Rotation;
}

export function getKickTable(
  type: ActivePiece['type'],
  from: Rotation,
  to: Rotation,
): readonly (readonly [number, number])[] {
  if (type === 'O') return KICK_O;
  // 180 rotations use identity only.
  const diff = (to - from + 4) & 3;
  if (diff === 2) return [[0, 0]];
  const key = `${from}->${to}`;
  return type === 'I' ? KICK_I[key] : KICK_JLSTZ[key];
}

export interface RotateResult {
  piece: ActivePiece;
  kickIndex: number;
}

/**
 * Attempt to rotate the piece in the given direction.
 * Returns the new piece on success, or null on failure.
 */
export function tryRotate(
  piece: ActivePiece,
  grid: Grid,
  dir: RotationDirection,
): RotateResult | null {
  const to = nextRotation(piece.rotation, dir);
  const kicks = getKickTable(piece.type, piece.rotation, to);
  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i];
    const nx = piece.x + dx;
    const ny = piece.y - dy; // invert: table is y-up, grid is y-down
    const cells = pieceCells(piece.type, to, nx, ny);
    if (!collidesCells(cells, grid)) {
      return {
        piece: {
          ...piece,
          x: nx,
          y: ny,
          rotation: to,
          lastMoveWasRotation: true,
          lastKickIndex: i,
        },
        kickIndex: i,
      };
    }
  }
  return null;
}

// Local helper so we don't double-import collides everywhere.
function collidesCells(cells: ReadonlyArray<readonly [number, number]>, grid: Grid): boolean {
  for (const [x, y] of cells) {
    if (x < 0 || x >= 10 || y < 0 || y >= 40) return true;
    if (grid[y][x] !== 0) return true;
  }
  return false;
}

// Re-export so callers don't need to import this helper twice.
export { collides };

import { B2B_MULTIPLIER, BUFFER_ROWS, COLS, COMBO_BASE, SCORE_BASE } from './config';
import type { ActivePiece, Grid, Rotation, ScoreUpdate } from './types';

export type TSpinKind = 'none' | 'mini' | 'full';

/**
 * Three-corner T-spin detection. Per spec:
 * - Piece must be T.
 * - Most recent move must be a rotation.
 * - At least 3 of the 4 diagonally-adjacent corners around the T's center are filled.
 * - The 5th (last) kick offset always produces a full T-spin regardless of corner check.
 * - Otherwise: 'full' if both "front" corners (the side the T points to) are filled, else 'mini'.
 */
export function detectTSpin(piece: ActivePiece, grid: Grid): TSpinKind {
  if (piece.type !== 'T') return 'none';
  if (!piece.lastMoveWasRotation) return 'none';

  const x = piece.x;
  const y = piece.y;
  // The four corners of the 3x3 bounding box.
  const corners: Array<[number, number]> = [
    [x, y],         // 0 top-left
    [x + 2, y],     // 1 top-right
    [x, y + 2],     // 2 bottom-left
    [x + 2, y + 2], // 3 bottom-right
  ];
  const filled = corners.map(([cx, cy]) =>
    cx < 0 || cx >= COLS || cy < 0 || cy >= grid.length || grid[cy][cx] !== 0,
  );
  const filledCount = filled.filter(Boolean).length;
  if (filledCount < 3) return 'none';

  if (piece.lastKickIndex === 4) return 'full';

  const front = frontCornersForRotation(piece.rotation);
  const frontFilled = front.filter((i) => filled[i]).length;
  return frontFilled >= 2 ? 'full' : 'mini';
}

/**
 * Returns indices (into the corners array above) that are on the "front" side
 * — i.e. the side the T points toward.
 *
 *   Rotation 0 ("up"): T points up, front = top-left + top-right    → [0, 1]
 *   Rotation R ("right"): T points right, front = top-right + bottom-right → [1, 3]
 *   Rotation 2 ("down"): T points down, front = bottom-left + bottom-right → [2, 3]
 *   Rotation L ("left"): T points left, front = top-left + bottom-left → [0, 2]
 */
function frontCornersForRotation(r: Rotation): [number, number] {
  switch (r) {
    case 0: return [0, 1];
    case 1: return [1, 3];
    case 2: return [2, 3];
    case 3: return [0, 2];
  }
}

/** Compute a score delta and updated B2B / combo state for a lock. */
export function scoreLock(args: {
  level: number;
  linesCleared: number;
  tspin: TSpinKind;
  b2bActive: boolean;
  combo: number; // -1 means no combo
}): ScoreUpdate {
  const { level, linesCleared, tspin, b2bActive, combo } = args;

  let basePoints = 0;
  let isDifficult = false;

  if (tspin === 'full') {
    if (linesCleared === 0) basePoints = SCORE_BASE.tspin;
    else if (linesCleared === 1) { basePoints = SCORE_BASE.tspinSingle; isDifficult = true; }
    else if (linesCleared === 2) { basePoints = SCORE_BASE.tspinDouble; isDifficult = true; }
    else if (linesCleared === 3) { basePoints = SCORE_BASE.tspinTriple; isDifficult = true; }
  } else if (tspin === 'mini') {
    if (linesCleared === 0) basePoints = SCORE_BASE.tspinMini;
    else if (linesCleared === 1) { basePoints = SCORE_BASE.tspinMiniSingle; isDifficult = true; }
  } else {
    if (linesCleared === 1) basePoints = SCORE_BASE.single;
    else if (linesCleared === 2) basePoints = SCORE_BASE.double;
    else if (linesCleared === 3) basePoints = SCORE_BASE.triple;
    else if (linesCleared === 4) { basePoints = SCORE_BASE.tetris; isDifficult = true; }
  }

  let linePoints = basePoints * level;

  let newB2b = b2bActive;
  if (linesCleared === 0) {
    // T-spin no-line: do not affect B2B chain.
  } else if (isDifficult) {
    if (b2bActive) linePoints = Math.floor(linePoints * B2B_MULTIPLIER);
    newB2b = true;
  } else {
    newB2b = false;
  }

  let newCombo = combo;
  let comboPoints = 0;
  if (linesCleared >= 1) {
    newCombo = combo + 1;
    if (newCombo >= 1) comboPoints = COMBO_BASE * newCombo * level;
  } else {
    newCombo = -1;
  }

  return {
    pointsDelta: linePoints + comboPoints,
    newB2b,
    newCombo,
    linesCleared,
    tspin,
  };
}

/** True iff the piece locks entirely in the buffer area. */
export function isLockOut(cells: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [, y] of cells) {
    if (y >= BUFFER_ROWS) return false;
  }
  return true;
}

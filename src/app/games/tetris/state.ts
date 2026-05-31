import { allCellsInBuffer, collides, createEmptyGrid, detectFullRows, lockPiece } from './board';
import { HARD_DROP_POINTS, SOFT_DROP_POINTS, type TetrisConfig } from './config';
import { gravityForLevel } from './gravity';
import { createLockState, shouldLock, tickLock, tryResetLock } from './lock';
import { pieceCells, SPAWN_POS } from './pieces';
import type { SevenBag } from './randomizer';
import { detectTSpin, scoreLock } from './scoring';
import { tryRotate, type RotationDirection } from './srs';
import type { ActivePiece, Cell, GameState, Grid, PieceType, ScoreUpdate, TopOutReason } from './types';

export interface TickEvents {
  lineClear: { rows: number[]; score: ScoreUpdate } | null;
  levelUp: number | null; // new level
  topOut: TopOutReason | null;
  scoreDelta: number;
  /** Soft-drop points awarded this tick (already included in scoreDelta). */
  softDropPoints: number;
  /** Hard-drop points awarded this tick (already included in scoreDelta). */
  hardDropPoints: number;
}

export function createInitialState(): GameState {
  return {
    grid: createEmptyGrid(),
    active: null,
    hold: { piece: null, locked: false },
    next: [],
    status: 'idle',
    topOutReason: null,
    score: 0,
    lines: 0,
    level: 1,
    gravityAccumulator: 0,
    softDropping: false,
    b2bActive: false,
    combo: -1,
    maxCombo: 0,
    lineClearTimerMs: 0,
    lineClearRows: [],
    startedAtMs: 0,
  };
}

export function makeActive(type: PieceType): ActivePiece {
  const [x, y] = SPAWN_POS[type];
  return {
    type,
    x,
    y,
    rotation: 0,
    lastMoveWasRotation: false,
    lastKickIndex: -1,
  };
}

/** Try to spawn a new piece from the bag. Sets topOutReason on block-out. */
export function spawnFromBag(state: GameState, bag: SevenBag, cfg: TetrisConfig): TopOutReason | null {
  const type = bag.next();
  const piece = makeActive(type);
  state.next = bag.peek(cfg.nextQueueLength);
  if (collides(piece, state.grid)) {
    // Block-out.
    state.active = piece; // store for debug/render of fail state
    state.topOutReason = 'block-out';
    state.status = 'gameover';
    return 'block-out';
  }
  state.active = piece;
  state.hold.locked = false;
  state.gravityAccumulator = 0;
  return null;
}

/** Spawn a held piece (by type) without consuming the bag. */
export function spawnFromType(state: GameState, type: PieceType): TopOutReason | null {
  const piece = makeActive(type);
  if (collides(piece, state.grid)) {
    state.active = piece;
    state.topOutReason = 'block-out';
    state.status = 'gameover';
    return 'block-out';
  }
  state.active = piece;
  state.gravityAccumulator = 0;
  return null;
}

/** Try to translate the piece by (dx, 0) or (0, +1). Returns true on success. */
export function tryTranslate(state: GameState, dx: number, dy: number): boolean {
  if (!state.active) return false;
  const candidate: ActivePiece = {
    ...state.active,
    x: state.active.x + dx,
    y: state.active.y + dy,
    lastMoveWasRotation: false,
    lastKickIndex: -1,
  };
  if (collides(candidate, state.grid)) return false;
  state.active = candidate;
  return true;
}

/** Returns true if a downward gravity step would collide. */
export function isGrounded(state: GameState): boolean {
  if (!state.active) return false;
  const candidate: ActivePiece = { ...state.active, y: state.active.y + 1 };
  return collides(candidate, state.grid);
}

export function tryRotatePiece(state: GameState, dir: RotationDirection): boolean {
  if (!state.active) return false;
  const result = tryRotate(state.active, state.grid, dir);
  if (!result) return false;
  state.active = result.piece;
  return true;
}

/** Performs a hard drop. Returns cells dropped. */
export function hardDrop(state: GameState): number {
  if (!state.active) return 0;
  let cells = 0;
  while (tryTranslate(state, 0, 1)) cells++;
  // mark not-rotation so a hard-dropped T cannot register as T-spin
  if (state.active) {
    state.active = { ...state.active, lastMoveWasRotation: false, lastKickIndex: -1 };
  }
  return cells;
}

/** Try to swap with hold. Returns true if the hold succeeded (false when locked). */
export function tryHold(state: GameState, bag: SevenBag, cfg: TetrisConfig): boolean {
  if (!state.active) return false;
  if (state.hold.locked) return false;
  const currentType = state.active.type;
  if (state.hold.piece === null) {
    state.hold.piece = currentType;
    spawnFromBag(state, bag, cfg);
  } else {
    const swap = state.hold.piece;
    state.hold.piece = currentType;
    spawnFromType(state, swap);
    state.next = bag.peek(cfg.nextQueueLength);
  }
  state.hold.locked = true;
  return true;
}

/**
 * Lock the current active piece into the grid, scoring as needed.
 * Returns events suitable for emitting to subscribers.
 */
export function lockAndScore(state: GameState, cfg: TetrisConfig): TickEvents {
  const events: TickEvents = {
    lineClear: null,
    levelUp: null,
    topOut: null,
    scoreDelta: 0,
    softDropPoints: 0,
    hardDropPoints: 0,
  };
  if (!state.active) return events;

  const piece = state.active;
  const cells = pieceCells(piece.type, piece.rotation, piece.x, piece.y);

  // T-spin detection BEFORE locking (so grid does not yet contain the piece).
  const tspin = detectTSpin(piece, state.grid);

  // Lock-out check (before grid mutation, on the locked cells).
  if (allCellsInBuffer(piece)) {
    lockPiece(piece, state.grid);
    state.active = null;
    state.topOutReason = 'lock-out';
    state.status = 'gameover';
    events.topOut = 'lock-out';
    return events;
  }
  lockPiece(piece, state.grid);

  const rowsTouched = uniqueRows(cells);
  const fullRows = detectFullRows(state.grid, rowsTouched);
  const linesCleared = fullRows.length;

  const update = scoreLock({
    level: state.level,
    linesCleared,
    tspin,
    b2bActive: state.b2bActive,
    combo: state.combo,
  });

  state.score += update.pointsDelta;
  events.scoreDelta += update.pointsDelta;
  state.b2bActive = update.newB2b;
  state.combo = update.newCombo;
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;

  if (linesCleared > 0) {
    // Defer the actual collapse to the line-clear animation tick.
    state.lineClearRows = fullRows;
    state.lineClearTimerMs = cfg.lineClearAnimMs;
    state.status = 'lineclear';
    const linesBefore = state.lines;
    state.lines += linesCleared;
    if (Math.floor(state.lines / 10) > Math.floor(linesBefore / 10)) {
      state.level = Math.floor(state.lines / 10) + 1;
      events.levelUp = state.level;
    }
    events.lineClear = { rows: fullRows, score: update };
  }

  state.active = null;
  return events;
}

function uniqueRows(cells: ReadonlyArray<readonly [number, number]>): number[] {
  const set = new Set<number>();
  for (const [, y] of cells) set.add(y);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Apply gravity for a single 60Hz tick:
 *  - Accumulate fractional rows from the gravity table, multiplied by soft-drop factor when held.
 *  - Step the piece down as many times as the accumulator allows or until grounded.
 *  - Award soft-drop points per cell actually descended via soft drop.
 *  - On grounded, discard the gravity accumulator remainder for this tick.
 */
export function applyGravity(state: GameState, cfg: TetrisConfig): { softDropCells: number } {
  if (!state.active) return { softDropCells: 0 };
  const base = gravityForLevel(state.level);
  const eff = state.softDropping ? base * cfg.softDropFactor : base;
  state.gravityAccumulator += eff;

  let softDropCells = 0;
  while (state.gravityAccumulator >= 1) {
    state.gravityAccumulator -= 1;
    const moved = tryTranslate(state, 0, 1);
    if (moved) {
      if (state.softDropping) softDropCells += 1;
    } else {
      state.gravityAccumulator = 0;
      break;
    }
  }
  return { softDropCells };
}

/** Award soft drop / hard drop points immediately (not multiplied by level). */
export function awardDropPoints(state: GameState, soft: number, hard: number): number {
  const pts = soft * SOFT_DROP_POINTS + hard * HARD_DROP_POINTS;
  state.score += pts;
  return pts;
}

/** Advance the line-clear animation; on completion, collapse rows. */
export function tickLineClear(state: GameState, dtMs: number): boolean {
  if (state.status !== 'lineclear') return false;
  state.lineClearTimerMs -= dtMs;
  if (state.lineClearTimerMs > 0) return false;
  // Collapse.
  const rows = state.lineClearRows;
  if (rows.length > 0) {
    // Build grid without the cleared rows, prepend empties.
    const drop = new Set(rows);
    const remaining: Grid = [];
    for (let y = 0; y < state.grid.length; y++) {
      if (!drop.has(y)) remaining.push(state.grid[y]);
    }
    const empties: Grid = [];
    for (let i = 0; i < rows.length; i++) {
      empties.push(new Array(10).fill(0) as Cell[]);
    }
    state.grid = [...empties, ...remaining];
  }
  state.lineClearRows = [];
  state.lineClearTimerMs = 0;
  state.status = 'playing';
  return true; // animation finished
}

export { createLockState, shouldLock, tickLock, tryResetLock };
export { detectFullRows };
export { gravityForLevel };

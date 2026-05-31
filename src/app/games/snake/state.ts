import { Direction, DELTA, RNG, randInt, wrapCol, wrapRow, tileIndex } from '../../../core';
import { SnakeConfig, SCORE } from './config';
import type { BodySegment, Cell, SnakeState, StepEvents } from './types';

export function createInitialState(cfg: SnakeConfig, rng: RNG): SnakeState {
  const occupied = new Uint8Array(cfg.cols * cfg.rows);
  const startRow = Math.floor(cfg.rows / 2);
  const startCol = Math.floor(cfg.cols / 2);
  const body: BodySegment[] = [];
  for (let i = 0; i < cfg.initialLength; i++) {
    const col = startCol - i;
    const row = startRow;
    body.push({ col, row, prevCol: col, prevRow: row, wrapped: false });
    occupied[tileIndex(col, row, cfg)] = 1;
  }
  const state: SnakeState = {
    cols: cfg.cols,
    rows: cfg.rows,
    mode: cfg.mode,
    body,
    ghostTail: null,
    occupied,
    direction: 'right',
    pendingGrowth: 0,
    food: null,
    bonus: null,
    status: 'idle',
    deathCause: null,
    score: 0,
    foodsEaten: 0,
    ticksToNextBonus: randInt(rng, cfg.bonusSpawnMinTicks, cfg.bonusSpawnMaxTicks + 1),
  };
  state.food = spawnFood(state, rng);
  return state;
}

/** Rejection sampling for a uniformly random empty cell. Returns null if the board is full. */
export function spawnFood(state: SnakeState, rng: RNG): Cell | null {
  const total = state.cols * state.rows;
  let empty = 0;
  for (let i = 0; i < total; i++) if (state.occupied[i] === 0) empty++;
  if (state.food) empty--;
  if (state.bonus) empty--;
  if (empty <= 0) return null;

  // Rejection sampling is recommended for the v1 board sizes (per spec § 5).
  // Cap attempts as a safety belt; if we somehow exhaust them, fall through to
  // a linear scan so the game never hangs.
  for (let attempts = 0; attempts < 200; attempts++) {
    const col = randInt(rng, 0, state.cols);
    const row = randInt(rng, 0, state.rows);
    if (cellFree(state, col, row)) return { col, row };
  }
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (cellFree(state, col, row)) return { col, row };
    }
  }
  return null;
}

function cellFree(state: SnakeState, col: number, row: number): boolean {
  if (state.occupied[tileIndex(col, row, state)] === 1) return false;
  if (state.food && state.food.col === col && state.food.row === row) return false;
  if (state.bonus && state.bonus.cell.col === col && state.bonus.cell.row === row) return false;
  return true;
}

const emptyEvents = (): StepEvents => ({
  ateFood: false,
  ateBonus: false,
  died: null,
  cleared: false,
  scoreDelta: 0,
});

/**
 * Advance the simulation one tick.
 *
 * Order matters here: the head is computed and tested for wall first, then the
 * grid is consulted for body/food/bonus. The tail pop happens after the
 * collision check, which makes "head moves into the tile the tail just
 * vacated" a death — matches the canonical Nokia behaviour (spec § 6).
 */
export function step(
  state: SnakeState,
  nextDirection: Direction | undefined,
  nowMs: number,
  rng: RNG,
  cfg: SnakeConfig,
): StepEvents {
  const events = emptyEvents();
  if (state.status !== 'playing') return events;

  // Precondition for tile-to-tile interpolation: every segment records its
  // current position as `prev` before any movement happens this tick. The
  // renderer interpolates between prev and current by the loop alpha.
  for (const seg of state.body) {
    seg.prevCol = seg.col;
    seg.prevRow = seg.row;
    seg.wrapped = false;
  }
  // A ghost tail only lives for one frame (the frame after its segment was
  // popped). Clear it now; we may install a fresh one below.
  state.ghostTail = null;

  if (nextDirection) state.direction = nextDirection;

  const head = state.body[0];
  const { dx, dy } = DELTA[state.direction];
  let nc = head.col + dx;
  let nr = head.row + dy;
  let headWrapped = false;

  if (state.mode === 'wrap') {
    const before = { c: nc, r: nr };
    nc = wrapCol(nc, state);
    nr = wrapRow(nr, state);
    headWrapped = nc !== before.c || nr !== before.r;
  } else if (nc < 0 || nc >= state.cols || nr < 0 || nr >= state.rows) {
    state.status = 'gameover';
    state.deathCause = 'wall';
    events.died = 'wall';
    return events;
  }

  // Body collision: spec says yes, the tail-vacate cell is a death.
  if (state.occupied[tileIndex(nc, nr, state)] === 1) {
    state.status = 'gameover';
    state.deathCause = 'self';
    events.died = 'self';
    return events;
  }

  // Food / bonus consumption.
  let grew = false;
  if (state.food && state.food.col === nc && state.food.row === nr) {
    events.ateFood = true;
    events.scoreDelta += SCORE.food;
    state.foodsEaten++;
    state.pendingGrowth += 1;
    grew = true;
    state.food = null;
  } else if (state.bonus && state.bonus.cell.col === nc && state.bonus.cell.row === nr) {
    events.ateBonus = true;
    events.scoreDelta += SCORE.bonus;
    state.bonus = null;
    // Bonus does NOT grow further (spec § 5).
  }

  // Push new head. A growth tick has the head appear in place (no prev to
  // slide from); otherwise prev is the cell ahead of the previous head.
  const newHead: BodySegment = {
    col: nc,
    row: nr,
    prevCol: head.col,
    prevRow: head.row,
    wrapped: headWrapped,
  };
  state.body.unshift(newHead);
  state.occupied[tileIndex(nc, nr, state)] = 1;

  // Pop tail unless growing.
  if (state.pendingGrowth > 0) {
    state.pendingGrowth -= 1;
    // Length bonus crossings (10, 20, ...).
    if (state.body.length % SCORE.lengthBonusEvery === 0) {
      events.scoreDelta += SCORE.lengthBonus;
    }
  } else {
    const tail = state.body.pop()!;
    state.occupied[tileIndex(tail.col, tail.row, state)] = 0;
    // Keep the vacated tail around for one frame as a "ghost": it interpolates
    // from where it was at tick start (prevCol/prevRow) toward where the new
    // tail sits now. Without this, the snake's rear end would visibly pop
    // off a cell at tick boundaries.
    const newTail = state.body[state.body.length - 1];
    if (newTail) {
      tail.col = newTail.prevCol;
      tail.row = newTail.prevRow;
      // Detect a wrap crossing for the ghost too; if its start/end are not
      // adjacent (Chebyshev > 1), suppress interpolation.
      if (Math.abs(tail.col - tail.prevCol) > 1 || Math.abs(tail.row - tail.prevRow) > 1) {
        tail.wrapped = true;
      }
      state.ghostTail = tail;
    } else {
      state.ghostTail = null;
    }
  }

  state.score += events.scoreDelta;

  // Respawn food.
  if (grew) {
    state.food = spawnFood(state, rng);
    if (state.food === null && !state.bonus) {
      state.status = 'cleared';
      events.cleared = true;
      return events;
    }
  }

  // Bonus food lifecycle.
  if (state.bonus && nowMs >= state.bonus.expiresAtMs) {
    state.bonus = null;
  }
  if (state.ticksToNextBonus > 0) {
    state.ticksToNextBonus--;
  } else if (!state.bonus) {
    const cell = spawnFood(state, rng);
    if (cell) {
      state.bonus = { cell, expiresAtMs: nowMs + cfg.bonusLifetimeMs };
    }
    state.ticksToNextBonus = randInt(rng, cfg.bonusSpawnMinTicks, cfg.bonusSpawnMaxTicks + 1);
  }

  return events;
}

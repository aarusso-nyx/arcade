import { Direction, DELTA, RNG, randInt, wrapCol, wrapRow, tileIndex } from '../../../core';
import { SnakeConfig, SCORE } from './config';
import type { Cell, SnakeState, StepEvents } from './types';

export function createInitialState(cfg: SnakeConfig, rng: RNG): SnakeState {
  const occupied = new Uint8Array(cfg.cols * cfg.rows);
  const startRow = Math.floor(cfg.rows / 2);
  const startCol = Math.floor(cfg.cols / 2);
  const body: Cell[] = [];
  for (let i = 0; i < cfg.initialLength; i++) {
    const c: Cell = { col: startCol - i, row: startRow };
    body.push(c);
    occupied[tileIndex(c.col, c.row, cfg)] = 1;
  }
  const state: SnakeState = {
    cols: cfg.cols,
    rows: cfg.rows,
    mode: cfg.mode,
    body,
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

  if (nextDirection) state.direction = nextDirection;

  const head = state.body[0];
  const { dx, dy } = DELTA[state.direction];
  let nc = head.col + dx;
  let nr = head.row + dy;

  if (state.mode === 'wrap') {
    nc = wrapCol(nc, state);
    nr = wrapRow(nr, state);
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

  // Push new head.
  const newHead: Cell = { col: nc, row: nr };
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

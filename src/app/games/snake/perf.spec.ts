/**
 * Perf-budget test for Snake.
 *
 * Asserts one engine tick + a full render on a 20x20 board with a snake of
 * length 50 completes under 0.5 ms mean — i.e. safely inside a 60fps frame
 * with room for the other games / the OS scheduler.
 *
 * Rationale for the workload:
 *  - 20x20 is the default board — this is what a live game actually runs.
 *  - Length 50 is much larger than the initial 4 and represents a
 *    long-in-the-run snake, where the body loop and renderer both do more.
 *  - We seed a deterministic state and reset it back to that seed before
 *    every timed iteration; the reset (Uint8Array copy + primitive field
 *    assignments) is well under one microsecond, so it does not confound
 *    the measurement of the tick + render itself.
 *
 * The test bypasses `mountCanvas` — we draw into a detached `<canvas>` so no
 * DOM attach / DPR scaling machinery runs.
 */
import { mulberry32, tileIndex } from '../../../core';
import { bench, formatBenchResult } from '../../../core/perf/bench';
import { DEFAULT_CONFIG, type SnakeConfig } from './config';
import { render } from './renderer';
import { createInitialState, step } from './state';
import type { BodySegment, SnakeState } from './types';

const BUDGET_MS = 0.5;

function makeContext(cfg: SnakeConfig): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = cfg.cols * cfg.cellSize;
  canvas.height = cfg.rows * cfg.cellSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for perf test');
  return ctx;
}

/**
 * Build a valid `SnakeState` with a serpentine body of length 50 laid out
 * across rows 0..2 of the top of the board. Head is at (9, 2) pointing
 * down — the tick will step it into (9, 3), an empty cell.
 */
function seedLongSnake(cfg: SnakeConfig): SnakeState {
  const state = createInitialState(cfg, mulberry32(1));
  const layout: Array<{ col: number; row: number }> = [];
  // Row 0: left → right, cols 0..19.
  for (let c = 0; c < cfg.cols; c++) layout.push({ col: c, row: 0 });
  // Row 1: right → left, cols 19..0.
  for (let c = cfg.cols - 1; c >= 0; c--) layout.push({ col: c, row: 1 });
  // Row 2: left → right, cols 0..9.
  for (let c = 0; c < 10; c++) layout.push({ col: c, row: 2 });

  const occupied = new Uint8Array(cfg.cols * cfg.rows);
  const body: BodySegment[] = [];
  // body[0] = head, so push last-placed cell first.
  for (let i = layout.length - 1; i >= 0; i--) {
    const p = layout[i];
    body.push({ col: p.col, row: p.row, prevCol: p.col, prevRow: p.row, wrapped: false });
    occupied[tileIndex(p.col, p.row, cfg)] = 1;
  }
  state.body = body;
  state.occupied = occupied;
  state.status = 'playing';
  state.direction = 'down'; // head at (9, 2) → next step (9, 3), which is empty.
  state.food = { col: cfg.cols - 1, row: cfg.rows - 1 }; // out of the head's path.
  state.bonus = null;
  state.pendingGrowth = 0;
  state.ghostTail = null;
  state.foodsEaten = 0;
  state.score = 0;
  state.deathCause = null;
  state.ticksToNextBonus = 1_000_000; // never spawn a bonus during the run.
  return state;
}

interface Snapshot {
  readonly body: ReadonlyArray<BodySegment>;
  readonly occupied: Uint8Array;
  readonly direction: SnakeState['direction'];
  readonly food: SnakeState['food'];
}

function snapshotOf(state: SnakeState): Snapshot {
  return {
    body: state.body.map((s) => ({ ...s })),
    occupied: new Uint8Array(state.occupied),
    direction: state.direction,
    food: state.food ? { ...state.food } : null,
  };
}

function restoreFrom(state: SnakeState, snap: Snapshot): void {
  // Reuse the existing body array to avoid GC pressure; reset entries in-place.
  state.body.length = 0;
  for (const s of snap.body) state.body.push({ ...s });
  state.occupied.set(snap.occupied);
  state.direction = snap.direction;
  state.food = snap.food ? { ...snap.food } : null;
  state.bonus = null;
  state.ghostTail = null;
  state.pendingGrowth = 0;
  state.status = 'playing';
  state.foodsEaten = 0;
  state.score = 0;
  state.deathCause = null;
  state.ticksToNextBonus = 1_000_000;
}

describe('snake perf budget', () => {
  it(`one tick + render ≤ ${BUDGET_MS} ms mean (20x20, length 50)`, () => {
    const cfg: SnakeConfig = { ...DEFAULT_CONFIG, cols: 20, rows: 20, cellSize: 24 };
    const state = seedLongSnake(cfg);
    const snap = snapshotOf(state);
    const ctx = makeContext(cfg);
    const rng = mulberry32(0xc0ffee);

    const runOnce = (): void => {
      restoreFrom(state, snap);
      step(state, undefined, 0, rng, cfg);
      render(ctx, state, cfg, { highScore: 0 }, 0, 0.5);
    };

    const result = bench(runOnce, { budgetMs: BUDGET_MS, iterations: 200, warmup: 20 });
    // eslint-disable-next-line no-console
    console.log('[perf] snake', formatBenchResult(result));
    expect(result.meanMs).withContext(formatBenchResult(result)).toBeLessThan(BUDGET_MS);
  });
});

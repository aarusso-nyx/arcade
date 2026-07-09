/**
 * Perf-budget test for Tetris.
 *
 * Asserts one engine tick + a full playfield + side-panel render on a
 * 10x40 grid (visible 10x20 + 20-row buffer) with a ~30 %-full locked
 * stack completes under 1.0 ms mean. See docs/work/tier-3/perf-budget-tests.md.
 *
 * The "tick" we time here is the same work the live game does inside its
 * 60 Hz loop when nothing exotic is happening: gravity accumulation +
 * lock-delay bookkeeping + a translate attempt against a real board.
 * Line-clear and lock-and-score are covered separately by *.spec.ts and
 * bring their own O(rows) copies — we skip them so this test measures the
 * per-frame steady-state cost that dominates real play.
 *
 * We draw into a detached `<canvas>` so no DOM attach / DPR scaling
 * machinery runs.
 */
import { mulberry32 } from '../../../core';
import { bench, formatBenchResult } from '../../../core/perf/bench';
import {
  BUFFER_ROWS,
  COLS,
  DEFAULT_CONFIG,
  TOTAL_ROWS,
  type TetrisConfig,
} from './config';
import { SevenBag } from './randomizer';
import { renderPlayfield, renderSidePanel } from './renderer';
import {
  applyGravity,
  createInitialState,
  createLockState,
  isGrounded,
  spawnFromBag,
  tickLock,
  tryTranslate,
} from './state';
import type { Cell, GameState, PieceType } from './types';

const BUDGET_MS = 1.0;

/** Fill roughly `fillFraction` of the visible rows with a deterministic pattern. */
function fillStack(state: GameState, fillFraction: number): void {
  const rng = mulberry32(0xdeadbeef);
  const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  for (let gy = BUFFER_ROWS; gy < TOTAL_ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      // Bias: bottom rows are denser. Overall density ≈ fillFraction.
      const rowDepth = (gy - BUFFER_ROWS) / (TOTAL_ROWS - BUFFER_ROWS);
      const p = fillFraction * (0.6 + 0.8 * rowDepth);
      if (rng() < p) {
        state.grid[gy][gx] = pieces[Math.floor(rng() * pieces.length)] as Cell;
      }
    }
  }
  // Guarantee no row is fully full — a full row would trigger the
  // line-clear path in downstream engine code and skew the measurement.
  for (let gy = BUFFER_ROWS; gy < TOTAL_ROWS; gy++) {
    state.grid[gy][0] = 0;
  }
}

function makeContext(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for perf test');
  return ctx;
}

describe('tetris perf budget', () => {
  it(`one tick + render ≤ ${BUDGET_MS} ms mean (10x40, ~30% stack)`, () => {
    const cfg: TetrisConfig = { ...DEFAULT_CONFIG };
    const state = createInitialState();
    const rng = mulberry32(1);
    const bag = new SevenBag(rng);
    // A real spawn produces an ActivePiece — the render / ghost-piece code
    // paths (dropY + collision loop over the pieceCells) depend on this.
    spawnFromBag(state, bag, cfg);
    state.status = 'playing';
    fillStack(state, 0.3);

    const lockRef = { state: createLockState() };

    const playCtx = makeContext(COLS * cfg.cellPx, cfg.rows * cfg.cellPx);
    const sideW = 5 * cfg.previewCellPx + 24;
    const sideH =
      4 * cfg.previewCellPx +
      12 +
      cfg.nextQueueLength * (3 * cfg.previewCellPx) +
      30 +
      24;
    const sideCtx = makeContext(sideW, sideH);

    // We save the active piece position so the tick doesn't gradually push
    // it into the stack across iterations — that would confound the
    // measurement with an eventual lock event.
    const savedActive = state.active ? { ...state.active } : null;

    const runOnce = (): void => {
      if (savedActive && state.active) {
        state.active.x = savedActive.x;
        state.active.y = savedActive.y;
        state.active.rotation = savedActive.rotation;
      }
      // Force one full row of gravity per tick so the hot path inside
      // `applyGravity` (collision-check + piece translate) actually runs,
      // rather than the fractional accumulate no-op at low levels.
      state.gravityAccumulator = 1;
      applyGravity(state, cfg);
      tryTranslate(state, 0, 0); // no-op translate exercises the collision-check hot path.
      lockRef.state = tickLock(
        lockRef.state,
        cfg.tickIntervalMs,
        isGrounded(state),
        cfg.lockDelayMs,
      );
      // Render.
      renderPlayfield(playCtx, state, cfg);
      renderSidePanel(sideCtx, state, cfg);
    };

    const result = bench(runOnce, { budgetMs: BUDGET_MS, iterations: 200, warmup: 20 });
    // eslint-disable-next-line no-console
    console.log('[perf] tetris', formatBenchResult(result));
    expect(result.meanMs).withContext(formatBenchResult(result)).toBeLessThan(BUDGET_MS);
  });
});

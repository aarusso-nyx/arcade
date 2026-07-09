/**
 * Perf-budget test for Bricks.
 *
 * Asserts one engine tick + a full render at the default 480x640 config
 * with the ball in flight, the paddle centred, and all seven rows of
 * bricks intact completes under 1.0 ms mean. See
 * docs/work/tier-3/perf-budget-tests.md.
 *
 * The engine's per-tick cost is dominated by the brick-hit scan (linear
 * over `brickRows * brickCols`) and the paddle-collision check; the
 * renderer draws every alive brick as a shadowed rounded rect plus the
 * paddle, ball, and HUD. This is the state we want to enforce a budget
 * against — first tick of a fresh rack is the worst case for both.
 *
 * The mount is bypassed — we draw into a detached `<canvas>` directly.
 */
import { bench, formatBenchResult } from '../../../core/perf/bench';
import { DEFAULT_CONFIG, type BricksConfig } from './config';
import { renderBricks } from './renderer';
import { createInitialState, launchBall, stepBricks } from './state';
import type { BricksState } from './types';

const BUDGET_MS = 1.0;

function makeContext(cfg: BricksConfig): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for perf test');
  return ctx;
}

/** Snapshot of the mutable ball/paddle fields so we can rewind per iteration. */
interface Rewindable {
  ballX: number;
  ballY: number;
  vx: number;
  vy: number;
  paddleX: number;
}

function snapshot(state: BricksState): Rewindable {
  return {
    ballX: state.ball.x,
    ballY: state.ball.y,
    vx: state.ballVelocity.x,
    vy: state.ballVelocity.y,
    paddleX: state.paddleX,
  };
}

function restore(state: BricksState, snap: Rewindable): void {
  state.ball.x = snap.ballX;
  state.ball.y = snap.ballY;
  state.ballVelocity.x = snap.vx;
  state.ballVelocity.y = snap.vy;
  state.paddleX = snap.paddleX;
  state.combo = 0;
  // Keep every brick alive so the hit-scan work is consistent across ticks.
  for (const brick of state.bricks) brick.alive = true;
  state.bricksRemaining = state.bricks.length;
  state.status = 'playing';
  state.stuckToPaddle = false;
}

describe('bricks perf budget', () => {
  it(`one tick + render ≤ ${BUDGET_MS} ms mean (default config, full rack)`, () => {
    const cfg = DEFAULT_CONFIG;
    const state = createInitialState(cfg, 0);
    // Move ball to mid-flight so the engine exercises the brick-hit scan,
    // paddle-collision test, and wall-bounce branches — not the "stuck to
    // paddle" no-op branch. `launchBall` gives us a valid velocity.
    state.status = 'playing';
    state.stuckToPaddle = true;
    launchBall(state, cfg);
    // Park the ball centre-court so its next tick doesn't hit anything —
    // gives a stable "hot loop" reading rather than a bouncing outlier.
    state.ball.x = cfg.width / 2;
    state.ball.y = 300;

    const snap = snapshot(state);
    const ctx = makeContext(cfg);

    const runOnce = (): void => {
      restore(state, snap);
      stepBricks(state, cfg);
      renderBricks(ctx, state, cfg);
    };

    const result = bench(runOnce, { budgetMs: BUDGET_MS, iterations: 200, warmup: 20 });
    // eslint-disable-next-line no-console
    console.log('[perf] bricks', formatBenchResult(result));
    expect(result.meanMs).withContext(formatBenchResult(result)).toBeLessThan(BUDGET_MS);
  });
});

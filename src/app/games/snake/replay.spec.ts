import { decodeReplay, encodeReplay, mulberry32 } from '../../../core';
import { DEFAULT_CONFIG, type SnakeConfig } from './config';
import {
  createSnakeRecorder,
  createSnakeReplayCursor,
  snakeConfigFromReplay,
} from './replay';
import { createInitialState, step } from './state';
import type { Direction } from '../../../core';

// The replay contract is engine-level: given (seed, cfg, input schedule),
// two independent runs must produce identical final state. These tests
// exercise that directly against the pure `step()` function — the same
// engine the orchestrator drives — so we don't need to spin up canvas /
// audio / raf loops.

const cfg = (overrides: Partial<SnakeConfig> = {}): SnakeConfig => ({
  ...DEFAULT_CONFIG,
  cols: 10,
  rows: 10,
  initialLength: 3,
  ...overrides,
});

interface RunResult {
  finalScore: number;
  foodsEaten: number;
  bodyLen: number;
  bodyHead: { col: number; row: number };
  endedAtTick: number;
  status: string;
}

/** Drive `step` for `maxTicks`, applying inputs from a schedule. */
function runToEnd(
  seed: number,
  cfgIn: SnakeConfig,
  schedule: readonly { tick: number; action: string }[],
  maxTicks: number,
): { result: RunResult; recorded: ReturnType<typeof createSnakeRecorder> } {
  const rng = mulberry32(seed);
  const state = createInitialState(cfgIn, rng);
  state.status = 'playing';
  const recorder = createSnakeRecorder();
  let ptr = 0;
  let pendingDir: Direction | undefined = undefined;
  let paused = false;
  let tickN = 0;
  for (; tickN < maxTicks; tickN++) {
    // Dispatch any scheduled inputs for this tick BEFORE step (matches
    // orchestrator: handleKeyEvents runs then step).
    while (ptr < schedule.length && schedule[ptr].tick === tickN) {
      const a = schedule[ptr].action;
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
        pendingDir = a as Direction;
        recorder.push(tickN, a);
      } else if (a === 'pause') {
        paused = true;
        recorder.push(tickN, 'pause');
      } else if (a === 'resume') {
        paused = false;
        recorder.push(tickN, 'resume');
      }
      ptr++;
    }
    if (paused) continue;
    const events = step(state, pendingDir, tickN, rng, cfgIn);
    pendingDir = undefined;
    if (events.died || events.cleared) {
      break;
    }
  }
  return {
    result: {
      finalScore: state.score,
      foodsEaten: state.foodsEaten,
      bodyLen: state.body.length,
      bodyHead: { col: state.body[0].col, row: state.body[0].row },
      endedAtTick: tickN,
      status: state.status,
    },
    recorded: recorder,
  };
}

describe('snake replay', () => {
  it('records the input schedule and finalises a valid Replay', () => {
    const seed = 0x51000001;
    const c = cfg({ mode: 'wrap' });
    const schedule = [
      { tick: 3, action: 'up' },
      { tick: 8, action: 'right' },
      { tick: 14, action: 'down' },
    ];
    const { result, recorded } = runToEnd(seed, c, schedule, 60);
    const replay = recorded.finalize({
      seed,
      cfg: c,
      endedAtTick: result.endedAtTick,
      finalScore: result.finalScore,
    });
    expect(replay.game).toBe('snake');
    expect(replay.seed).toBe(seed >>> 0);
    expect(replay.config['mode']).toBe(1); // wrap
    expect(replay.inputs.length).toBe(schedule.length);
    expect(replay.finalScore).toBe(result.finalScore);
  });

  it('round-trips through encode/decode and replays deterministically', () => {
    const seed = 0xf00d1234;
    const c = cfg();
    const schedule = [
      { tick: 2, action: 'up' },
      { tick: 5, action: 'right' },
      { tick: 9, action: 'down' },
      { tick: 13, action: 'left' },
    ];
    const first = runToEnd(seed, c, schedule, 60);
    const replay = first.recorded.finalize({
      seed,
      cfg: c,
      endedAtTick: first.result.endedAtTick,
      finalScore: first.result.finalScore,
    });

    const encoded = encodeReplay(replay);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeReplay(encoded);

    // Replay through a fresh state using the decoded schedule.
    const cursor = createSnakeReplayCursor(decoded);
    const rng2 = mulberry32(decoded.seed);
    const state2 = createInitialState(c, rng2);
    state2.status = 'playing';
    let pendingDir: Direction | undefined = undefined;
    let paused = false;
    let tickN = 0;
    while (tickN <= decoded.endedAtTick) {
      const acts = cursor.actionsAt(tickN);
      for (const a of acts) {
        if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
          pendingDir = a as Direction;
        } else if (a === 'pause') paused = true;
        else if (a === 'resume') paused = false;
      }
      if (!paused && state2.status === 'playing') {
        const events = step(state2, pendingDir, tickN, rng2, c);
        pendingDir = undefined;
        if (events.died || events.cleared) break;
      }
      tickN++;
    }

    // Final state must match.
    expect(state2.score).toBe(first.result.finalScore);
    expect(state2.foodsEaten).toBe(first.result.foodsEaten);
    expect(state2.body.length).toBe(first.result.bodyLen);
    expect(state2.body[0].col).toBe(first.result.bodyHead.col);
    expect(state2.body[0].row).toBe(first.result.bodyHead.row);
  });

  it('recovers cols/rows/mode via snakeConfigFromReplay', () => {
    const seed = 42;
    const c = cfg({ mode: 'wrap', cols: 12, rows: 8 });
    const replay = createSnakeRecorder().finalize({
      seed,
      cfg: c,
      endedAtTick: 10,
      finalScore: 0,
    });
    const recovered = snakeConfigFromReplay(replay);
    expect(recovered.cols).toBe(12);
    expect(recovered.rows).toBe(8);
    expect(recovered.mode).toBe('wrap');
  });

  it('produces a compact wire size for a 60-tick run', () => {
    const seed = 0xbabecafe;
    const c = cfg();
    const schedule = [
      { tick: 4, action: 'up' },
      { tick: 9, action: 'right' },
      { tick: 15, action: 'down' },
      { tick: 22, action: 'left' },
      { tick: 30, action: 'up' },
    ];
    const { result, recorded } = runToEnd(seed, c, schedule, 60);
    const replay = recorded.finalize({
      seed,
      cfg: c,
      endedAtTick: result.endedAtTick,
      finalScore: result.finalScore,
    });
    const encoded = encodeReplay(replay);
    // Brief target: ≤ 200 chars for a typical 60-second Snake run. We're
    // well under with a short schedule.
    expect(encoded.length).toBeLessThanOrEqual(200);
  });

  it('cursor drains all actions when replayed in order', () => {
    const replay = {
      game: 'snake' as const,
      version: 1 as const,
      seed: 1,
      config: { cols: 10, rows: 10, mode: 0 },
      inputs: [
        { tick: 3, action: 'up' },
        { tick: 3, action: 'right' }, // simultaneous same-tick actions
        { tick: 7, action: 'down' },
      ],
      endedAtTick: 10,
      finalScore: 0,
    };
    const cursor = createSnakeReplayCursor(replay);
    expect(cursor.actionsAt(0)).toEqual([]);
    expect(cursor.actionsAt(3)).toEqual(['up', 'right']);
    expect(cursor.actionsAt(7)).toEqual(['down']);
    expect(cursor.done).toBe(true);
  });
});

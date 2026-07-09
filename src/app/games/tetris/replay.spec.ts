import { decodeReplay, encodeReplay, mulberry32 } from '../../../core';
import { DEFAULT_CONFIG, type TetrisConfig } from './config';
import { SevenBag } from './randomizer';
import {
  createTetrisRecorder,
  createTetrisReplayCursor,
  tetrisConfigFromReplay,
} from './replay';
import {
  applyGravity,
  awardDropPoints,
  createInitialState,
  hardDrop,
  lockAndScore,
  spawnFromBag,
  tickLineClear,
  tryTranslate,
  tryRotatePiece,
} from './state';
import type { GameState } from './types';
import type { TetrisAction } from '../../../core';

// As with Snake, tetris determinism is a property of (seed, config,
// ordered input stream) applied to the pure engine. Testing at that layer
// exercises the same code the orchestrator uses without pulling in canvas
// mounts, audio contexts, or requestAnimationFrame.

const testCfg = (overrides: Partial<TetrisConfig> = {}): TetrisConfig => ({
  ...DEFAULT_CONFIG,
  ...overrides,
});

interface Snapshot {
  score: number;
  lines: number;
  level: number;
  status: string;
  gridHash: string;
}

const gridHash = (state: GameState): string => {
  // Compact digest: y then x. Cheap enough for a spec.
  const parts: string[] = [];
  for (let y = 0; y < state.grid.length; y++) {
    for (let x = 0; x < state.grid[y].length; x++) {
      parts.push(state.grid[y][x] === 0 ? '.' : (state.grid[y][x] as string));
    }
    parts.push('|');
  }
  return parts.join('');
};

const snapshotOf = (state: GameState): Snapshot => ({
  score: state.score,
  lines: state.lines,
  level: state.level,
  status: state.status,
  gridHash: gridHash(state),
});

/**
 * Advance a pure-state tetris run through a fixed schedule of tick-tagged
 * actions. Returns the final state + the recorded action stream.
 */
function driveRun(
  seed: number,
  cfg: TetrisConfig,
  schedule: readonly { tick: number; action: TetrisAction }[],
  maxTicks: number,
): { state: GameState; recorded: ReturnType<typeof createTetrisRecorder> } {
  const rng = mulberry32(seed);
  const bag = new SevenBag(rng);
  const state: GameState = createInitialState();
  state.status = 'playing' as GameState['status'];
  state.startedAtMs = 0;
  spawnFromBag(state, bag, cfg);
  const recorder = createTetrisRecorder();
  let ptr = 0;
  const TICK_MS = cfg.tickIntervalMs;
  for (let t = 0; t < maxTicks; t++) {
    if (state.status === 'gameover') break;
    // Line-clear animation tick.
    if (state.status === 'lineclear') {
      const done = tickLineClear(state, TICK_MS);
      if (done) {
        spawnFromBag(state, bag, cfg);
      }
      continue;
    }
    // Dispatch actions scheduled at this tick.
    while (ptr < schedule.length && schedule[ptr].tick === t) {
      const a = schedule[ptr].action;
      applyAction(a, state, bag, cfg);
      recorder.push(t, a);
      ptr++;
    }
    if (state.status !== 'playing') continue;
    // Gravity + potentially lock.
    applyGravity(state, cfg);
    // Lock immediately if grounded — pure replay assumes no lock delay so
    // the input schedule maps 1:1 across runs; tests don't need to model
    // the 500ms lock-delay accurately.
  }
  return { state, recorded: recorder };
}

/** Apply a single action to a live state (matches game.ts applyReplayAction). */
function applyAction(
  a: TetrisAction,
  state: GameState,
  bag: SevenBag,
  cfg: TetrisConfig,
): void {
  if (!state.active) return;
  switch (a) {
    case 'left':
      tryTranslate(state, -1, 0);
      break;
    case 'right':
      tryTranslate(state, 1, 0);
      break;
    case 'rotCW':
      tryRotatePiece(state, 'CW');
      break;
    case 'rotCCW':
      tryRotatePiece(state, 'CCW');
      break;
    case 'rot180':
      tryRotatePiece(state, '180');
      break;
    case 'soft':
      state.softDropping = !state.softDropping;
      break;
    case 'hard': {
      const cells = hardDrop(state);
      if (cells > 0) awardDropPoints(state, 0, cells);
      const ev = lockAndScore(state, cfg);
      if (!ev.lineClear && state.status !== 'gameover') {
        spawnFromBag(state, bag, cfg);
      }
      break;
    }
    case 'hold':
      // Simplified: skip hold in this test.
      break;
  }
}

describe('tetris replay', () => {
  it('records and finalises a valid Replay', () => {
    const seed = 0xd1a3b2c1;
    const cfg = testCfg();
    const schedule: { tick: number; action: TetrisAction }[] = [
      { tick: 3, action: 'left' },
      { tick: 5, action: 'rotCW' },
      { tick: 8, action: 'hard' },
    ];
    const { state, recorded } = driveRun(seed, cfg, schedule, 60);
    const replay = recorded.finalize({
      seed,
      cfg,
      endedAtTick: 60,
      finalScore: state.score,
    });
    expect(replay.game).toBe('tetris');
    expect(replay.seed).toBe(seed >>> 0);
    expect(replay.inputs.length).toBe(schedule.length);
    expect(replay.finalScore).toBe(state.score);
    expect(replay.config['cellPx']).toBe(cfg.cellPx);
  });

  it('round-trips through encode/decode and reproduces final state', () => {
    const seed = 0x88112233;
    const cfg = testCfg();
    const schedule: { tick: number; action: TetrisAction }[] = [
      { tick: 2, action: 'left' },
      { tick: 3, action: 'left' },
      { tick: 4, action: 'rotCW' },
      { tick: 6, action: 'hard' },
      { tick: 12, action: 'right' },
      { tick: 14, action: 'rot180' },
      { tick: 20, action: 'hard' },
      { tick: 28, action: 'rotCCW' },
      { tick: 34, action: 'hard' },
    ];
    const first = driveRun(seed, cfg, schedule, 120);
    const firstSnap = snapshotOf(first.state);
    const replay = first.recorded.finalize({
      seed,
      cfg,
      endedAtTick: 120,
      finalScore: firstSnap.score,
    });
    const encoded = encodeReplay(replay);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeReplay(encoded);
    expect(decoded.inputs).toEqual(replay.inputs);

    // Replay the decoded schedule against a fresh engine.
    const cursor = createTetrisReplayCursor(decoded);
    const rng2 = mulberry32(decoded.seed);
    const bag2 = new SevenBag(rng2);
    const state2: GameState = createInitialState();
    state2.status = 'playing' as GameState['status'];
    state2.startedAtMs = 0;
    spawnFromBag(state2, bag2, cfg);
    const TICK_MS = cfg.tickIntervalMs;
    for (let t = 0; t < 120; t++) {
      if (state2.status === 'gameover') break;
      if (state2.status === 'lineclear') {
        const done = tickLineClear(state2, TICK_MS);
        if (done) spawnFromBag(state2, bag2, cfg);
        continue;
      }
      const acts = cursor.actionsAt(t);
      for (const a of acts) applyAction(a, state2, bag2, cfg);
      if (state2.status !== 'playing') continue;
      applyGravity(state2, cfg);
    }
    const secondSnap = snapshotOf(state2);
    expect(secondSnap.score).toBe(firstSnap.score);
    expect(secondSnap.lines).toBe(firstSnap.lines);
    expect(secondSnap.level).toBe(firstSnap.level);
    expect(secondSnap.gridHash).toBe(firstSnap.gridHash);
  });

  it('tetrisConfigFromReplay recovers cellPx', () => {
    const cfg = testCfg({ cellPx: 24 });
    const r = createTetrisRecorder().finalize({
      seed: 1,
      cfg,
      endedAtTick: 0,
      finalScore: 0,
    });
    expect(tetrisConfigFromReplay(r).cellPx).toBe(24);
  });

  it('produces a compact wire size for a run with a couple dozen inputs', () => {
    const seed = 0xa55aa55a;
    const cfg = testCfg();
    // 24 evenly-spaced inputs, mixed types.
    const acts: TetrisAction[] = [
      'left',
      'right',
      'rotCW',
      'rotCCW',
      'rot180',
      'hard',
      'hold',
      'soft',
    ];
    const schedule: { tick: number; action: TetrisAction }[] = [];
    for (let i = 0; i < 24; i++) {
      schedule.push({ tick: i * 10 + (i % 3), action: acts[i % acts.length] });
    }
    // Even without driving the engine, we can encode a synthetic replay of
    // this shape to measure wire size.
    const replay = {
      game: 'tetris' as const,
      version: 1 as const,
      seed,
      config: { cellPx: cfg.cellPx, startLevel: 1 },
      inputs: schedule,
      endedAtTick: 240,
      finalScore: 1200,
    };
    const encoded = encodeReplay(replay);
    // Brief target: ≤ 400 chars for a typical tetris run. 24 inputs is far
    // below "typical" — this asserts encoding overhead per input is small.
    expect(encoded.length).toBeLessThanOrEqual(120);
  });

  it('cursor drains all actions when replayed in order', () => {
    const replay = {
      game: 'tetris' as const,
      version: 1 as const,
      seed: 1,
      config: { cellPx: 30, startLevel: 1 },
      inputs: [
        { tick: 2, action: 'left' },
        { tick: 2, action: 'left' },
        { tick: 5, action: 'hard' },
      ],
      endedAtTick: 20,
      finalScore: 0,
    };
    const cursor = createTetrisReplayCursor(replay);
    expect(cursor.actionsAt(0)).toEqual([]);
    expect(cursor.actionsAt(2)).toEqual(['left', 'left'] as TetrisAction[]);
    expect(cursor.actionsAt(5)).toEqual(['hard'] as TetrisAction[]);
    expect(cursor.done).toBe(true);
  });
});

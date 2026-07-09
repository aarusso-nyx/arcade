/**
 * Snake-side glue for the shared replay codec.
 *
 * The engine (`state.ts`) is already a pure function of `(config, seed, inputs)`
 * — the only randomness comes from `mulberry32(seed)` threaded through food
 * spawns. That means we don't have to record anything else to replay a run:
 * seed + the ordered stream of direction / pause changes is sufficient.
 */

import type { Replay, ReplayInput, SnakeAction } from '../../../core';
import type { SnakeConfig } from './config';
import type { GameMode } from './types';

/** Encode the snake game's mode as the 1-byte value stored in the codec. */
export const snakeModeToByte = (m: GameMode): number => (m === 'wrap' ? 1 : 0);
export const byteToSnakeMode = (b: number): GameMode => (b === 1 ? 'wrap' : 'classic');

/** Build a fresh recorder. `Recorder.push` is called at input-arrival time. */
export interface SnakeRecorder {
  /** Record an accepted action; `tick` is the loop's current tick counter. */
  push(tick: number, action: SnakeAction): void;
  /**
   * Called once at run-start (fresh `beginRun`). Clears the buffer so a
   * failed-and-retry lifecycle doesn't concatenate two runs.
   */
  reset(): void;
  /** Package the recording as a `Replay`. */
  finalize(args: {
    seed: number;
    cfg: SnakeConfig;
    endedAtTick: number;
    finalScore: number;
  }): Replay;
  /** Read-only view for tests. */
  readonly inputs: readonly ReplayInput[];
}

export function createSnakeRecorder(): SnakeRecorder {
  let inputs: ReplayInput[] = [];
  return {
    push(tick, action) {
      // Micro-guard: if the caller pushes out of order (shouldn't happen since
      // tick is monotonic in the loop), clamp so the encoder doesn't throw.
      const last = inputs.length > 0 ? inputs[inputs.length - 1].tick : -1;
      inputs.push({ tick: Math.max(tick, last), action });
    },
    reset() {
      inputs = [];
    },
    finalize({ seed, cfg, endedAtTick, finalScore }) {
      return {
        game: 'snake',
        version: 1,
        seed: seed >>> 0,
        config: {
          cols: cfg.cols,
          rows: cfg.rows,
          mode: snakeModeToByte(cfg.mode),
        },
        inputs: inputs.slice(),
        endedAtTick,
        finalScore,
      };
    },
    get inputs(): readonly ReplayInput[] {
      return inputs;
    },
  };
}

/**
 * A tiny cursor over a `Replay.inputs` list: yields the actions that should be
 * applied AT tick `t`, in the order they were recorded. Advances internally.
 */
export interface SnakeReplayCursor {
  /** Actions whose tick == `t`. Advances the internal pointer past them. */
  actionsAt(t: number): SnakeAction[];
  /** Convenience: is the cursor exhausted? */
  readonly done: boolean;
}

export function createSnakeReplayCursor(replay: Replay): SnakeReplayCursor {
  if (replay.game !== 'snake') {
    throw new Error(`expected a snake replay, got ${replay.game}`);
  }
  let i = 0;
  return {
    actionsAt(t: number): SnakeAction[] {
      const out: SnakeAction[] = [];
      while (i < replay.inputs.length && replay.inputs[i].tick === t) {
        out.push(replay.inputs[i].action as SnakeAction);
        i++;
      }
      // Also fast-forward past any past-tick entries (safety net for a
      // recorder that briefly issued out-of-order ticks).
      while (i < replay.inputs.length && replay.inputs[i].tick < t) i++;
      return out;
    },
    get done(): boolean {
      return i >= replay.inputs.length;
    },
  };
}

/**
 * Recover a partial `SnakeConfig` from a replay's config block. Callers merge
 * this into `DEFAULT_CONFIG` (so unset fields keep sane defaults).
 */
export function snakeConfigFromReplay(replay: Replay): Partial<SnakeConfig> {
  return {
    cols: replay.config['cols'],
    rows: replay.config['rows'],
    mode: byteToSnakeMode(replay.config['mode']),
  };
}

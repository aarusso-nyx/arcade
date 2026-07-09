/**
 * Tetris-side glue for the shared replay codec.
 *
 * Tetris is deterministic given (seed, config, ordered input stream), where
 * "inputs" are the discrete effects that would normally arise from a key
 * press + the DAS/ARR auto-repeat machine: a single-cell left/right, a
 * rotation, a soft-drop toggle, a hard-drop, or a hold swap.
 *
 * We record at the *resolved* level (post-DAS) so replay doesn't have to
 * re-simulate keydown/keyup timing. That keeps the replayer trivial: at each
 * tick, dispatch any actions whose recorded tick matches, then run the
 * normal gravity + lock-delay pipeline.
 */

import type { Replay, ReplayInput, TetrisAction } from '../../../core';
import type { TetrisConfig } from './config';

export interface TetrisRecorder {
  push(tick: number, action: TetrisAction): void;
  reset(): void;
  finalize(args: {
    seed: number;
    cfg: TetrisConfig;
    endedAtTick: number;
    finalScore: number;
  }): Replay;
  readonly inputs: readonly ReplayInput[];
}

export function createTetrisRecorder(): TetrisRecorder {
  let inputs: ReplayInput[] = [];
  return {
    push(tick, action) {
      const last = inputs.length > 0 ? inputs[inputs.length - 1].tick : -1;
      inputs.push({ tick: Math.max(tick, last), action });
    },
    reset() {
      inputs = [];
    },
    finalize({ seed, cfg, endedAtTick, finalScore }) {
      // Clamp to 0..255 for the fixed-byte codec fields. Level here is the
      // *starting* level so gravity replays from the right rung.
      const cellPx = Math.min(255, Math.max(0, cfg.cellPx | 0));
      const startLevel = 1;
      return {
        game: 'tetris',
        version: 1,
        seed: seed >>> 0,
        config: { cellPx, startLevel },
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

export interface TetrisReplayCursor {
  actionsAt(t: number): TetrisAction[];
  readonly done: boolean;
}

export function createTetrisReplayCursor(replay: Replay): TetrisReplayCursor {
  if (replay.game !== 'tetris') {
    throw new Error(`expected a tetris replay, got ${replay.game}`);
  }
  let i = 0;
  return {
    actionsAt(t: number): TetrisAction[] {
      const out: TetrisAction[] = [];
      while (i < replay.inputs.length && replay.inputs[i].tick === t) {
        out.push(replay.inputs[i].action as TetrisAction);
        i++;
      }
      while (i < replay.inputs.length && replay.inputs[i].tick < t) i++;
      return out;
    },
    get done(): boolean {
      return i >= replay.inputs.length;
    },
  };
}

export function tetrisConfigFromReplay(replay: Replay): Partial<TetrisConfig> {
  const out: Partial<TetrisConfig> = {};
  const cellPx = replay.config['cellPx'];
  if (cellPx !== undefined && cellPx > 0) out.cellPx = cellPx;
  return out;
}

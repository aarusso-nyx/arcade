import type { Direction } from '../../../core';

export type Cell = { col: number; row: number };

/**
 * A snake body segment. `col`/`row` are the discrete grid cell occupied right
 * now; `prevCol`/`prevRow` are where the segment was on the previous tick.
 * The renderer interpolates between the two by the loop's tick `alpha`.
 *
 * `wrapped` is set on a segment when its move from prev→curr crossed a wrap
 * boundary; the renderer snaps that segment instead of drawing it tearing
 * across the board.
 */
export interface BodySegment {
  col: number;
  row: number;
  prevCol: number;
  prevRow: number;
  wrapped: boolean;
}

export type GameMode = 'classic' | 'wrap';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover' | 'cleared';

export type DeathCause = 'wall' | 'self';

export interface BonusFood {
  cell: Cell;
  /** Wall-clock ms when the bonus despawns (advanced only while not paused). */
  expiresAtMs: number;
}

export interface SnakeState {
  readonly cols: number;
  readonly rows: number;
  readonly mode: GameMode;
  /** Index 0 = head, last = tail. */
  body: BodySegment[];
  /**
   * On a non-growing tick the tail is popped from `body` but still needs to
   * interpolate out of its cell for one frame. The renderer draws this
   * "ghost" segment when present (so the snake doesn't visually skip cells).
   * `null` on growth ticks and the first tick of a run.
   */
  ghostTail: BodySegment | null;
  /** Length = cols*rows. 1 = snake cell, 0 = empty. */
  occupied: Uint8Array;
  /** Direction committed for the most recent tick. */
  direction: Direction;
  /** Cells still to grow over the next few ticks. */
  pendingGrowth: number;
  food: Cell | null;
  bonus: BonusFood | null;
  status: GameStatus;
  deathCause: DeathCause | null;
  score: number;
  foodsEaten: number;
  /** Ticks until the next bonus food spawn attempt. -1 = no bonus pending counter. */
  ticksToNextBonus: number;
}

export interface StepEvents {
  ateFood: boolean;
  ateBonus: boolean;
  died: DeathCause | null;
  cleared: boolean;
  scoreDelta: number;
}

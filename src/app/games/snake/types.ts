import type { Direction } from '../../../core';

export type Cell = { col: number; row: number };

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
  body: Cell[];
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

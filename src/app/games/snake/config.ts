import type { GameMode } from './types';

export interface SnakeConfig {
  cols: number;
  rows: number;
  cellSize: number;
  mode: GameMode;
  initialLength: number;
  /** Starting tick interval, ms. */
  startTickMs: number;
  /** Minimum tick interval after acceleration, ms. */
  minTickMs: number;
  /** Decrement per acceleration step, ms. */
  stepMs: number;
  /** Foods between acceleration steps. */
  foodsPerStep: number;
  /** Min ticks between bonus food spawn attempts (jittered up to +max-min). */
  bonusSpawnMinTicks: number;
  bonusSpawnMaxTicks: number;
  /** Bonus food lifetime in ms (uses unpaused wall clock). */
  bonusLifetimeMs: number;
}

export const DEFAULT_CONFIG: SnakeConfig = {
  cols: 20,
  rows: 20,
  cellSize: 24,
  mode: 'classic',
  initialLength: 4,
  startTickMs: 200,
  minTickMs: 60,
  stepMs: 10,
  foodsPerStep: 5,
  bonusSpawnMinTicks: 8,
  bonusSpawnMaxTicks: 15,
  bonusLifetimeMs: 8000,
};

export const SCORE = {
  food: 10,
  bonus: 50,
  lengthBonusEvery: 10,
  lengthBonus: 25,
} as const;

export const tickIntervalFor = (foodsEaten: number, cfg: SnakeConfig): number => {
  const steps = Math.floor(foodsEaten / cfg.foodsPerStep);
  return Math.max(cfg.minTickMs, cfg.startTickMs - cfg.stepMs * steps);
};

import type { FruitType } from './types';

export const TILE_SIZE = 8;
export const GRID_W = 28;
export const GRID_H = 31;

export const HUD_TOP_H = 24; // 3 tiles
export const HUD_BOTTOM_H = 16; // 2 tiles
export const PLAYFIELD_W = GRID_W * TILE_SIZE; // 224
export const PLAYFIELD_H = GRID_H * TILE_SIZE; // 248
export const CANVAS_W = PLAYFIELD_W; // 224
export const CANVAS_H = HUD_TOP_H + PLAYFIELD_H + HUD_BOTTOM_H; // 288

export const TICK_HZ = 60;
export const TICK_MS = 1000 / 60;
export const FULL_SPEED_PX_PER_TICK = 1.0; // 100% reference

export const STARTING_LIVES = 3;
export const EXTRA_LIFE_THRESHOLD = 10_000;
export const PELLET_POINTS = 10;
export const POWER_PELLET_POINTS = 50;
export const GHOST_CHAIN_POINTS = [200, 400, 800, 1600] as const;

export const TOTAL_PELLETS = 240;
export const TOTAL_POWER_PELLETS = 4;

export const FRUIT_TRIGGER_THRESHOLDS = [70, 170] as const;
export const FRUIT_LIFETIME_TICKS_MIN = 9 * 60;
export const FRUIT_LIFETIME_TICKS_MAX = 10 * 60;
export const CORNER_CUT_PIXELS = 2;

/**
 * Tiles where ghosts in scatter/chase mode may not choose "up". Coords are
 * adjusted for the 31-row maze with the door at row 12 and the lower
 * T-intersections at row 23. Spec § 2.3 lists these abstractly; the precise
 * row indices depend on maze layout — we verify walkability at load.
 */
export const NO_UP_TILES: ReadonlyArray<readonly [number, number]> = [
  [12, 11],
  [15, 11],
  [12, 23],
  [15, 23],
];

export const GHOST_HOUSE_DOOR_TILE: readonly [number, number] = [13, 12];
/** Pixel position immediately above the door, between the two door tiles. */
export const GHOST_HOUSE_EXIT_PX: readonly [number, number] = [14 * 8, 11 * 8 + 4];

export const BLINKY_START_TILE: readonly [number, number] = [13, 11];
export const PINKY_START_TILE: readonly [number, number] = [13, 14];
export const INKY_START_TILE: readonly [number, number] = [11, 14];
export const CLYDE_START_TILE: readonly [number, number] = [15, 14];

export const HOME_CORNERS = {
  blinky: [25, 0],
  pinky: [2, 0],
  inky: [27, 29],
  clyde: [0, 29],
} as const;

/** Tile where the fruit appears (just below the ghost house exit). */
export const FRUIT_TILE: readonly [number, number] = [13, 17];

/**
 * Speed table — fraction of full speed (1.0 = 75.75 px/sec ≈ 1 px/tick) for each per-level
 * combination. Pac frightened applies while a power window is active. Ghost frightened applies
 * to ghosts in frightened state. Ghost tunnel applies to ghosts in slow-zone tiles.
 */
export interface LevelSpeed {
  pacNormal: number;
  pacFrightened: number;
  ghostNormal: number;
  ghostFrightened: number;
  ghostTunnel: number;
  elroy1: number;
  elroy2: number;
}

export const SPEED_TABLE: readonly LevelSpeed[] = [
  // Index 0 unused (levels are 1-indexed). Duplicate level-1 for convenience.
  { pacNormal: 0.8, pacFrightened: 0.9, ghostNormal: 0.75, ghostFrightened: 0.5, ghostTunnel: 0.4, elroy1: 0.8, elroy2: 0.85 },
  { pacNormal: 0.8, pacFrightened: 0.9, ghostNormal: 0.75, ghostFrightened: 0.5, ghostTunnel: 0.4, elroy1: 0.8, elroy2: 0.85 },
];

const LEVEL_2_4: LevelSpeed = {
  pacNormal: 0.9,
  pacFrightened: 0.95,
  ghostNormal: 0.85,
  ghostFrightened: 0.55,
  ghostTunnel: 0.45,
  elroy1: 0.9,
  elroy2: 0.95,
};

const LEVEL_5_20: LevelSpeed = {
  pacNormal: 1.0,
  pacFrightened: 1.0,
  ghostNormal: 0.95,
  ghostFrightened: 0.6,
  ghostTunnel: 0.5,
  elroy1: 1.0,
  elroy2: 1.05,
};

const LEVEL_21_PLUS: LevelSpeed = {
  pacNormal: 0.9,
  pacFrightened: 0.9, // n/a (no frightened from level 19+); harmless
  ghostNormal: 0.95,
  ghostFrightened: 0.6,
  ghostTunnel: 0.5,
  elroy1: 1.0,
  elroy2: 1.05,
};

export const EATEN_GHOST_SPEED = 1.5;

export function getLevelSpeed(level: number): LevelSpeed {
  if (level <= 1) return SPEED_TABLE[1];
  if (level <= 4) return LEVEL_2_4;
  if (level <= 20) return LEVEL_5_20;
  return LEVEL_21_PLUS;
}

/** Elroy thresholds: dots remaining at which Blinky becomes Elroy 1 / 2. */
export interface ElroyThreshold {
  elroy1: number;
  elroy2: number;
}

export function getElroyThresholds(level: number): ElroyThreshold {
  if (level <= 1) return { elroy1: 20, elroy2: 10 };
  if (level === 2) return { elroy1: 30, elroy2: 15 };
  if (level <= 5) return { elroy1: 40, elroy2: 20 };
  if (level <= 8) return { elroy1: 50, elroy2: 25 };
  if (level <= 11) return { elroy1: 60, elroy2: 30 };
  if (level <= 14) return { elroy1: 80, elroy2: 40 };
  if (level <= 18) return { elroy1: 100, elroy2: 50 };
  return { elroy1: 120, elroy2: 60 };
}

/** Scatter/chase schedule. Times in seconds. The trailing entry runs forever. */
export interface SchedulePhase {
  mode: 'scatter' | 'chase';
  seconds: number; // Infinity for "forever"
}

const SCHEDULE_L1: readonly SchedulePhase[] = [
  { mode: 'scatter', seconds: 7 },
  { mode: 'chase', seconds: 20 },
  { mode: 'scatter', seconds: 7 },
  { mode: 'chase', seconds: 20 },
  { mode: 'scatter', seconds: 5 },
  { mode: 'chase', seconds: 20 },
  { mode: 'scatter', seconds: 5 },
  { mode: 'chase', seconds: Infinity },
];

const SCHEDULE_L2_4: readonly SchedulePhase[] = [
  { mode: 'scatter', seconds: 7 },
  { mode: 'chase', seconds: 20 },
  { mode: 'scatter', seconds: 7 },
  { mode: 'chase', seconds: 1033 },
  { mode: 'scatter', seconds: 1 / 60 },
  { mode: 'chase', seconds: Infinity },
];

const SCHEDULE_L5: readonly SchedulePhase[] = [
  { mode: 'scatter', seconds: 5 },
  { mode: 'chase', seconds: 20 },
  { mode: 'scatter', seconds: 5 },
  { mode: 'chase', seconds: 1037 },
  { mode: 'scatter', seconds: 1 / 60 },
  { mode: 'chase', seconds: Infinity },
];

export function getSchedule(level: number): readonly SchedulePhase[] {
  if (level <= 1) return SCHEDULE_L1;
  if (level <= 4) return SCHEDULE_L2_4;
  return SCHEDULE_L5;
}

/** Frightened duration in seconds and number of flashes. */
export interface FrightTable {
  seconds: number;
  flashes: number;
}

export function getFrightTable(level: number): FrightTable {
  switch (level) {
    case 1: return { seconds: 6, flashes: 5 };
    case 2: return { seconds: 5, flashes: 5 };
    case 3: return { seconds: 4, flashes: 5 };
    case 4: return { seconds: 3, flashes: 5 };
    case 5: return { seconds: 2, flashes: 5 };
    case 6: return { seconds: 5, flashes: 5 };
    case 7:
    case 8: return { seconds: 2, flashes: 5 };
    case 9: return { seconds: 1, flashes: 3 };
    case 10: return { seconds: 5, flashes: 5 };
    case 11: return { seconds: 2, flashes: 5 };
    case 12:
    case 13: return { seconds: 1, flashes: 3 };
    case 14: return { seconds: 3, flashes: 5 };
    case 15:
    case 16: return { seconds: 1, flashes: 3 };
    case 17: return { seconds: 0, flashes: 0 };
    case 18: return { seconds: 1, flashes: 3 };
    default: return { seconds: 0, flashes: 0 };
  }
}

/** Per-ghost personal pellet release thresholds (Section 6.1). */
export interface PersonalThresholds {
  pinky: number;
  inky: number;
  clyde: number;
}

export function getPersonalThresholds(level: number): PersonalThresholds {
  if (level <= 1) return { pinky: 0, inky: 30, clyde: 60 };
  if (level === 2) return { pinky: 0, inky: 0, clyde: 50 };
  return { pinky: 0, inky: 0, clyde: 0 };
}

/** Global pellet release thresholds after Pac-Man dies (Section 6.2). */
export const GLOBAL_RELEASE = { pinky: 7, inky: 17, clyde: 32 } as const;

/** Idle release timer (in ticks). 4s for levels 1-4, 3s for level 5+. */
export function getIdleReleaseTicks(level: number): number {
  return (level <= 4 ? 4 : 3) * 60;
}

/** Fruit type per level. */
export function getFruitForLevel(level: number): FruitType {
  if (level === 1) return 'cherry';
  if (level === 2) return 'strawberry';
  if (level <= 4) return 'orange';
  if (level <= 6) return 'apple';
  if (level <= 8) return 'melon';
  if (level <= 10) return 'galaxian';
  if (level <= 12) return 'bell';
  return 'key';
}

export function getFruitPoints(level: number): number {
  if (level === 1) return 100;
  if (level === 2) return 300;
  if (level <= 4) return 500;
  if (level <= 6) return 700;
  if (level <= 8) return 1000;
  if (level <= 10) return 2000;
  if (level <= 12) return 3000;
  return 5000;
}

/** Ticks for the ready phase (~2 seconds). */
export const READY_TICKS = 2 * 60;
/** Ticks for the dying phase (~1.5 seconds animation + 1 second freeze). */
export const DYING_FREEZE_TICKS = 60;
export const DYING_ANIM_TICKS = 90;
export const DYING_TOTAL_TICKS = DYING_FREEZE_TICKS + DYING_ANIM_TICKS;
/** Ticks for level-clear (~6 seconds total: pause + flash). */
export const LEVELCLEAR_TICKS = 6 * 60;

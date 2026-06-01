export interface TetrisConfig {
  // Timing (ms)
  dasMs: number;
  arrMs: number;
  lockDelayMs: number;
  moveResetCap: number;
  lineClearAnimMs: number;
  // Speeds
  softDropFactor: number;
  // Layout
  cellPx: number;
  previewCellPx: number;
  nextQueueLength: number;
  cols: number;
  rows: number; // visible rows
  bufferRows: number; // buffer rows above visible
  // Gravity
  maxGravityRowsPerTick: number;
  // Logical tick interval (ms). Engine ticks at 60Hz.
  tickIntervalMs: number;
  // Storage key
  storageKey: string;
  // Features
  ghostEnabled: boolean;
  enableT180: boolean;
  enablePartialLockOut: boolean;
}

export const DEFAULT_CONFIG: TetrisConfig = {
  dasMs: 170,
  arrMs: 30,
  lockDelayMs: 500,
  moveResetCap: 15,
  lineClearAnimMs: 200,
  softDropFactor: 20,
  cellPx: 30,
  previewCellPx: 20,
  nextQueueLength: 5,
  cols: 10,
  rows: 20,
  bufferRows: 20,
  maxGravityRowsPerTick: 20,
  tickIntervalMs: 1000 / 60,
  storageKey: 'highScore',
  ghostEnabled: true,
  enableT180: true,
  enablePartialLockOut: false,
};

/** Guideline colors per piece type. */
export const PALETTE: Record<'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L', string> = {
  I: '#00F0F0',
  O: '#F0F000',
  T: '#A000F0',
  S: '#00F000',
  Z: '#F00000',
  J: '#0000F0',
  L: '#F0A000',
};

export const SCORE_BASE = {
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
  tspinMini: 100,
  tspinMiniSingle: 200,
  tspin: 400,
  tspinSingle: 800,
  tspinDouble: 1200,
  tspinTriple: 1600,
} as const;

export const B2B_MULTIPLIER = 1.5;
export const COMBO_BASE = 50;
export const SOFT_DROP_POINTS = 1;
export const HARD_DROP_POINTS = 2;

/** Cells in the buffer (y < bufferRows = y < 20). */
export const TOTAL_ROWS = DEFAULT_CONFIG.bufferRows + DEFAULT_CONFIG.rows; // 40
export const BUFFER_ROWS = DEFAULT_CONFIG.bufferRows; // 20
export const COLS = DEFAULT_CONFIG.cols; // 10

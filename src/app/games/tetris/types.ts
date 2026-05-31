export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type Cell = 0 | PieceType;

/** Row-major grid: grid[y][x], y in [0,39], x in [0,9]. */
export type Grid = Cell[][];

export type Rotation = 0 | 1 | 2 | 3; // 0=spawn, 1=R, 2=180, 3=L

export interface ActivePiece {
  type: PieceType;
  /** Top-left of the piece bounding box. */
  x: number;
  y: number;
  rotation: Rotation;
  /** Was the most recent successful operation a rotation? Reset on translate/gravity. */
  lastMoveWasRotation: boolean;
  /** Kick offset index used in the most recent rotation, or -1. */
  lastKickIndex: number;
}

export interface HoldState {
  piece: PieceType | null;
  /** True once hold has been used since the active piece spawned. */
  locked: boolean;
}

export interface LockState {
  grounded: boolean;
  /** Counts down from the lock-delay ms while grounded. */
  timerMs: number;
  /** Number of move-resets used by the current piece (0..15). */
  resetCount: number;
}

export type GameStatus =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'lineclear'
  | 'gameover';

export type TopOutReason = 'block-out' | 'lock-out';

export interface GameState {
  grid: Grid;
  active: ActivePiece | null;
  hold: HoldState;
  /** Pre-peeked next queue, copied from bag for rendering. */
  next: PieceType[];
  status: GameStatus;
  topOutReason: TopOutReason | null;
  score: number;
  lines: number;
  level: number;
  /** Fractional gravity accumulator in rows. */
  gravityAccumulator: number;
  /** True while soft-drop key is held. */
  softDropping: boolean;
  /** True iff the previous line-clearing lock was "difficult". */
  b2bActive: boolean;
  /** Combo counter: -1 means no combo. */
  combo: number;
  /** Highest combo achieved this run. */
  maxCombo: number;
  /** Wall-clock ms used by the line-clear animation. */
  lineClearTimerMs: number;
  /** Rows pending clear during the line-clear animation. */
  lineClearRows: number[];
  /** Time the game started, ms. */
  startedAtMs: number;
}

export interface ScoreUpdate {
  pointsDelta: number;
  newB2b: boolean;
  newCombo: number;
  linesCleared: number;
  tspin: 'none' | 'mini' | 'full';
}

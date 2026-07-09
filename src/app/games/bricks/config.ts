export interface BricksConfig {
  readonly width: number;
  readonly height: number;
  readonly tickIntervalMs: number;
  readonly paddleWidth: number;
  readonly paddleHeight: number;
  readonly paddleY: number;
  readonly paddleSpeed: number;
  readonly ballRadius: number;
  readonly baseBallSpeed: number;
  readonly maxBallSpeed: number;
  readonly brickRows: number;
  readonly brickCols: number;
  readonly brickWidth: number;
  readonly brickHeight: number;
  readonly brickGap: number;
  readonly brickTop: number;
  readonly brickLeft: number;
  readonly lives: number;
  readonly storageKey: string;
}

export const DEFAULT_CONFIG: BricksConfig = {
  width: 480,
  height: 640,
  tickIntervalMs: 1000 / 60,
  paddleWidth: 88,
  paddleHeight: 14,
  paddleY: 590,
  paddleSpeed: 7,
  ballRadius: 7,
  baseBallSpeed: 4.4,
  maxBallSpeed: 7.2,
  brickRows: 7,
  brickCols: 10,
  brickWidth: 40,
  brickHeight: 18,
  brickGap: 6,
  brickTop: 78,
  brickLeft: 13,
  lives: 3,
  storageKey: 'highScore',
};

export const ROW_POINTS = [70, 70, 50, 50, 30, 30, 10] as const;

export const BRICK_COLORS = [
  '#e35d6a',
  '#e35d6a',
  '#d4ad3a',
  '#d4ad3a',
  '#5fb56b',
  '#5fb56b',
  '#4eb0d9',
] as const;

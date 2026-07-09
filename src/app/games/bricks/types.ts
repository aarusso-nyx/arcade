export type BricksStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'levelclear' | 'gameover';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Brick {
  readonly id: number;
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly points: number;
  readonly color: string;
  alive: boolean;
}

export interface BricksState {
  status: BricksStatus;
  score: number;
  highScore: number;
  lives: number;
  level: number;
  combo: number;
  bricksRemaining: number;
  paddleX: number;
  ball: Vec2;
  ballVelocity: Vec2;
  stuckToPaddle: boolean;
  messageTimer: number;
  bricks: Brick[];
}

export interface BricksStepEvents {
  readonly brickHits: number;
  readonly paddleHit: boolean;
  readonly wallHit: boolean;
  readonly lifeLost: boolean;
  readonly levelCleared: boolean;
  readonly gameOver: boolean;
}

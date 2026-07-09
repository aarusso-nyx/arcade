import { BRICK_COLORS, DEFAULT_CONFIG, ROW_POINTS, type BricksConfig } from './config';
import type { Brick, BricksState, BricksStepEvents } from './types';

const READY_TICKS = 45;
const LEVEL_CLEAR_TICKS = 90;
const MAX_BOUNCE_DEGREES = 62;

const EMPTY_EVENTS: BricksStepEvents = {
  brickHits: 0,
  paddleHit: false,
  wallHit: false,
  lifeLost: false,
  levelCleared: false,
  gameOver: false,
};

export function createInitialState(
  cfg: BricksConfig = DEFAULT_CONFIG,
  highScore = 0,
): BricksState {
  const state: BricksState = {
    status: 'idle',
    score: 0,
    highScore,
    lives: cfg.lives,
    level: 1,
    combo: 0,
    bricksRemaining: 0,
    paddleX: (cfg.width - cfg.paddleWidth) / 2,
    ball: { x: cfg.width / 2, y: cfg.paddleY - cfg.ballRadius - 1 },
    ballVelocity: { x: 0, y: 0 },
    stuckToPaddle: true,
    messageTimer: 0,
    bricks: [],
  };
  resetBricks(state, cfg);
  resetBallOnPaddle(state, cfg);
  return state;
}

export function startRun(state: BricksState, cfg: BricksConfig = DEFAULT_CONFIG): void {
  state.status = 'ready';
  state.score = 0;
  state.lives = cfg.lives;
  state.level = 1;
  state.combo = 0;
  state.messageTimer = READY_TICKS;
  resetBricks(state, cfg);
  resetBallOnPaddle(state, cfg);
}

export function launchBall(state: BricksState, cfg: BricksConfig = DEFAULT_CONFIG): void {
  if (!state.stuckToPaddle) return;
  const speed = getBallSpeed(state, cfg);
  state.ballVelocity = { x: speed * 0.35, y: -speed * 0.94 };
  normalizeVelocity(state.ballVelocity, speed);
  state.stuckToPaddle = false;
  state.status = 'playing';
  state.messageTimer = 0;
}

export function togglePause(state: BricksState): void {
  if (state.status === 'playing' || state.status === 'ready') {
    state.status = 'paused';
  } else if (state.status === 'paused') {
    state.status = state.stuckToPaddle ? 'ready' : 'playing';
  }
}

export function movePaddle(
  state: BricksState,
  direction: -1 | 0 | 1,
  cfg: BricksConfig = DEFAULT_CONFIG,
): void {
  if (direction === 0 || state.status === 'gameover' || state.status === 'idle') return;
  const next = clamp(state.paddleX + direction * cfg.paddleSpeed, 0, cfg.width - cfg.paddleWidth);
  const dx = next - state.paddleX;
  state.paddleX = next;
  if (state.stuckToPaddle) {
    state.ball.x = clamp(state.ball.x + dx, cfg.ballRadius, cfg.width - cfg.ballRadius);
  }
}

export function stepBricks(
  state: BricksState,
  cfg: BricksConfig = DEFAULT_CONFIG,
): BricksStepEvents {
  if (state.status === 'levelclear') {
    state.messageTimer--;
    if (state.messageTimer <= 0) {
      state.level++;
      state.status = 'ready';
      state.messageTimer = READY_TICKS;
      resetBricks(state, cfg);
      resetBallOnPaddle(state, cfg);
    }
    return EMPTY_EVENTS;
  }

  if (state.status === 'ready') {
    state.messageTimer = Math.max(0, state.messageTimer - 1);
    return EMPTY_EVENTS;
  }

  if (state.status !== 'playing') return EMPTY_EVENTS;

  const events = { ...EMPTY_EVENTS };
  state.ball.x += state.ballVelocity.x;
  state.ball.y += state.ballVelocity.y;

  if (state.ball.x - cfg.ballRadius <= 0) {
    state.ball.x = cfg.ballRadius;
    state.ballVelocity.x = Math.abs(state.ballVelocity.x);
    events.wallHit = true;
  } else if (state.ball.x + cfg.ballRadius >= cfg.width) {
    state.ball.x = cfg.width - cfg.ballRadius;
    state.ballVelocity.x = -Math.abs(state.ballVelocity.x);
    events.wallHit = true;
  }

  if (state.ball.y - cfg.ballRadius <= 0) {
    state.ball.y = cfg.ballRadius;
    state.ballVelocity.y = Math.abs(state.ballVelocity.y);
    events.wallHit = true;
  }

  if (collidesWithPaddle(state, cfg) && state.ballVelocity.y > 0) {
    bounceFromPaddle(state, cfg);
    state.combo = 0;
    events.paddleHit = true;
  }

  const hit = findBrickHit(state, cfg);
  if (hit) {
    hit.alive = false;
    state.bricksRemaining--;
    state.combo++;
    state.score += hit.points + Math.max(0, state.combo - 1) * 5;
    bounceFromBrick(state, hit, cfg);
    events.brickHits = 1;
    if (state.bricksRemaining === 0) {
      state.status = 'levelclear';
      state.messageTimer = LEVEL_CLEAR_TICKS;
      events.levelCleared = true;
    }
  }

  if (state.ball.y - cfg.ballRadius > cfg.height) {
    state.lives--;
    state.combo = 0;
    events.lifeLost = true;
    if (state.lives <= 0) {
      state.status = 'gameover';
      events.gameOver = true;
    } else {
      state.status = 'ready';
      state.messageTimer = READY_TICKS;
      resetBallOnPaddle(state, cfg);
    }
  }

  if (state.score > state.highScore) state.highScore = state.score;
  return events;
}

export function resetBricks(state: BricksState, cfg: BricksConfig = DEFAULT_CONFIG): void {
  const bricks: Brick[] = [];
  let id = 0;
  for (let row = 0; row < cfg.brickRows; row++) {
    for (let col = 0; col < cfg.brickCols; col++) {
      bricks.push({
        id,
        row,
        col,
        x: cfg.brickLeft + col * (cfg.brickWidth + cfg.brickGap),
        y: cfg.brickTop + row * (cfg.brickHeight + cfg.brickGap),
        width: cfg.brickWidth,
        height: cfg.brickHeight,
        points: ROW_POINTS[row] ?? 10,
        color: BRICK_COLORS[row] ?? '#4eb0d9',
        alive: true,
      });
      id++;
    }
  }
  state.bricks = bricks;
  state.bricksRemaining = bricks.length;
}

function resetBallOnPaddle(state: BricksState, cfg: BricksConfig): void {
  state.stuckToPaddle = true;
  state.paddleX = clamp(state.paddleX, 0, cfg.width - cfg.paddleWidth);
  state.ball = {
    x: state.paddleX + cfg.paddleWidth / 2,
    y: cfg.paddleY - cfg.ballRadius - 1,
  };
  state.ballVelocity = { x: 0, y: 0 };
}

function collidesWithPaddle(state: BricksState, cfg: BricksConfig): boolean {
  const withinX =
    state.ball.x + cfg.ballRadius >= state.paddleX &&
    state.ball.x - cfg.ballRadius <= state.paddleX + cfg.paddleWidth;
  const withinY =
    state.ball.y + cfg.ballRadius >= cfg.paddleY &&
    state.ball.y - cfg.ballRadius <= cfg.paddleY + cfg.paddleHeight;
  return withinX && withinY;
}

function bounceFromPaddle(state: BricksState, cfg: BricksConfig): void {
  const paddleCenter = state.paddleX + cfg.paddleWidth / 2;
  const normalized = clamp((state.ball.x - paddleCenter) / (cfg.paddleWidth / 2), -1, 1);
  const angle = (normalized * MAX_BOUNCE_DEGREES * Math.PI) / 180;
  const speed = getBallSpeed(state, cfg);
  state.ballVelocity.x = Math.sin(angle) * speed;
  state.ballVelocity.y = -Math.cos(angle) * speed;
  state.ball.y = cfg.paddleY - cfg.ballRadius - 0.1;
}

function findBrickHit(state: BricksState, cfg: BricksConfig): Brick | null {
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    const closestX = clamp(state.ball.x, brick.x, brick.x + brick.width);
    const closestY = clamp(state.ball.y, brick.y, brick.y + brick.height);
    const dx = state.ball.x - closestX;
    const dy = state.ball.y - closestY;
    if (dx * dx + dy * dy <= cfg.ballRadius * cfg.ballRadius) return brick;
  }
  return null;
}

function bounceFromBrick(state: BricksState, brick: Brick, cfg: BricksConfig): void {
  const previousX = state.ball.x - state.ballVelocity.x;
  const previousY = state.ball.y - state.ballVelocity.y;
  const crossedLeft = previousX + cfg.ballRadius <= brick.x;
  const crossedRight = previousX - cfg.ballRadius >= brick.x + brick.width;
  const crossedTop = previousY + cfg.ballRadius <= brick.y;
  const crossedBottom = previousY - cfg.ballRadius >= brick.y + brick.height;

  if (crossedLeft || crossedRight) {
    state.ballVelocity.x *= -1;
  } else if (crossedTop || crossedBottom) {
    state.ballVelocity.y *= -1;
  } else {
    state.ballVelocity.y *= -1;
  }
  normalizeVelocity(state.ballVelocity, getBallSpeed(state, cfg));
}

function getBallSpeed(state: BricksState, cfg: BricksConfig): number {
  return Math.min(cfg.maxBallSpeed, cfg.baseBallSpeed + (state.level - 1) * 0.35 + state.combo * 0.035);
}

function normalizeVelocity(v: { x: number; y: number }, speed: number): void {
  const length = Math.hypot(v.x, v.y) || 1;
  v.x = (v.x / length) * speed;
  v.y = (v.y / length) * speed;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

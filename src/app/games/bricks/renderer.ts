import { getCurrentTheme, type BricksPalette } from '../../../core';
import { DEFAULT_CONFIG, type BricksConfig } from './config';
import type { BricksState } from './types';

/**
 * All colours come from the active theme. Brick colours are looked up by
 * row index (via the palette's `brickRows`), which lets a theme change take
 * effect on the next paint even for bricks that were placed by an older
 * theme — the `brick.color` field stored on state is treated as a fallback.
 */
function palette(): BricksPalette {
  return getCurrentTheme().games.bricks;
}

function brickColor(row: number, fallback: string, p: BricksPalette): string {
  return p.brickRows[row] ?? fallback;
}

export function renderBricks(
  ctx: CanvasRenderingContext2D,
  state: BricksState,
  cfg: BricksConfig = DEFAULT_CONFIG,
): void {
  const p = palette();
  drawBackground(ctx, cfg, p);
  drawHud(ctx, state, cfg, p);
  drawBricks(ctx, state, p);
  drawPaddle(ctx, state, cfg, p);
  drawBall(ctx, state, cfg, p);
  drawOverlay(ctx, state, cfg, p);
}

function drawBackground(ctx: CanvasRenderingContext2D, cfg: BricksConfig, p: BricksPalette): void {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, cfg.width, cfg.height);
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cfg.width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cfg.height);
    ctx.stroke();
  }
  ctx.fillStyle = p.panel;
  ctx.fillRect(0, 0, cfg.width, 52);
  ctx.strokeStyle = p.panelBorder;
  ctx.strokeRect(0.5, 0.5, cfg.width - 1, cfg.height - 1);
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: BricksState,
  cfg: BricksConfig,
  p: BricksPalette,
): void {
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.dim;
  ctx.fillText('SCORE', 16, 16);
  ctx.fillStyle = p.fg;
  ctx.fillText(String(state.score).padStart(5, '0'), 16, 36);

  ctx.fillStyle = p.dim;
  ctx.fillText('HIGH', 168, 16);
  ctx.fillStyle = p.fg;
  ctx.fillText(String(state.highScore).padStart(5, '0'), 168, 36);

  ctx.fillStyle = p.dim;
  ctx.fillText('LIVES', 320, 16);
  ctx.fillStyle = p.ball;
  ctx.fillText(String(state.lives), 320, 36);

  ctx.fillStyle = p.dim;
  ctx.fillText('L', cfg.width - 64, 16);
  ctx.fillStyle = p.fg;
  ctx.fillText(String(state.level), cfg.width - 64, 36);
}

function drawBricks(ctx: CanvasRenderingContext2D, state: BricksState, p: BricksPalette): void {
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = p.shadow;
    ctx.fillRect(brick.x + 2, brick.y + 3, brick.width, brick.height);
    ctx.fillStyle = brickColor(brick.row, brick.color, p);
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.fillRect(brick.x + 3, brick.y + 3, brick.width - 6, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1);
  }
}

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  state: BricksState,
  cfg: BricksConfig,
  p: BricksPalette,
): void {
  const r = 5;
  const x = state.paddleX;
  const y = cfg.paddleY;
  ctx.fillStyle = p.shadow;
  roundRect(ctx, x + 2, y + 3, cfg.paddleWidth, cfg.paddleHeight, r);
  ctx.fill();
  ctx.fillStyle = p.paddle;
  roundRect(ctx, x, y, cfg.paddleWidth, cfg.paddleHeight, r);
  ctx.fill();
  ctx.fillStyle = p.paddleEdge;
  roundRect(ctx, x + 8, y + 3, cfg.paddleWidth - 16, 3, 2);
  ctx.fill();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  state: BricksState,
  cfg: BricksConfig,
  p: BricksPalette,
): void {
  ctx.fillStyle = p.shadow;
  ctx.beginPath();
  ctx.arc(state.ball.x + 2, state.ball.y + 2, cfg.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ball;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, cfg.ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.arc(state.ball.x - 2, state.ball.y - 2, cfg.ballRadius * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: BricksState,
  cfg: BricksConfig,
  p: BricksPalette,
): void {
  if (state.status === 'paused') {
    drawPauseOverlay(ctx, cfg.width, cfg.height, p);
    return;
  }
  let title = '';
  let subtitle = '';
  if (state.status === 'idle') {
    title = 'BRICKS';
    subtitle = 'Press Enter';
  } else if (state.status === 'ready' && state.messageTimer < 25) {
    title = 'READY';
    subtitle = 'Space to launch';
  } else if (state.status === 'levelclear') {
    title = `LEVEL ${state.level} CLEAR`;
    subtitle = 'Next rack';
  } else if (state.status === 'gameover') {
    title = 'GAME OVER';
    subtitle = 'Enter to retry';
  }
  if (!title) return;

  ctx.fillStyle = p.overlayBg;
  ctx.fillRect(0, 220, cfg.width, 130);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '24px "Press Start 2P", monospace';
  ctx.fillStyle = title === 'GAME OVER' ? p.overlayDanger : p.fg;
  ctx.fillText(title, cfg.width / 2, 270);
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.fillStyle = p.dim;
  ctx.fillText(subtitle, cfg.width / 2, 314);
  ctx.textAlign = 'left';
}

function drawPauseOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: BricksPalette,
): void {
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const titleSize = 24;
  const fontFamily = '"Press Start 2P", monospace';

  ctx.save();
  ctx.fillStyle = p.overlayBg;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cy = h / 2;
  const titleY = cy - titleSize * 0.3;

  ctx.font = `${titleSize}px ${fontFamily}`;
  const titleW = ctx.measureText('PAUSED').width;

  const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowMs / 380));
  ctx.globalAlpha = pulse;
  ctx.fillStyle = p.pauseAccent;
  const chevronGap = titleSize * 0.9;
  const chevronSize = titleSize * 0.6;
  drawChevronArrow(ctx, w / 2 - titleW / 2 - chevronGap, titleY, chevronSize, 'right');
  drawChevronArrow(ctx, w / 2 + titleW / 2 + chevronGap, titleY, chevronSize, 'left');
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.pauseAccent;
  ctx.fillText('PAUSED', w / 2, titleY);

  ctx.font = `10px ${fontFamily}`;
  ctx.fillStyle = p.dim;
  ctx.fillText('Space / P to resume · Esc to quit', w / 2, cy + titleSize * 1.0);

  ctx.textAlign = 'left';
  ctx.restore();
}

function drawChevronArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  facing: 'left' | 'right',
): void {
  const half = size / 2;
  const dx = facing === 'right' ? half : -half;
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy - half);
  ctx.lineTo(cx + dx, cy);
  ctx.lineTo(cx - dx, cy + half);
  ctx.closePath();
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

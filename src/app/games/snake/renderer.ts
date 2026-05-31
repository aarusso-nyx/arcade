import { DELTA } from '../../../core';
import type { SnakeConfig } from './config';
import type { SnakeState } from './types';

const COLORS = {
  bg: '#0b0d10',
  grid: '#15191e',
  food: '#e94e4e',
  bonus: '#ffd24a',
  body: '#3ec46d',
  head: '#5be089',
  hudFg: '#e6e6e6',
  hudDim: '#8a8f99',
  overlayBg: 'rgba(11, 13, 16, 0.78)',
} as const;

export function render(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  cfg: SnakeConfig,
  nowMs: number,
): void {
  const w = cfg.cols * cfg.cellSize;
  const h = cfg.rows * cfg.cellSize;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, cfg);
  if (state.food) drawFood(ctx, state.food.col, state.food.row, cfg, nowMs, COLORS.food, 1);
  if (state.bonus) {
    const remaining = state.bonus.expiresAtMs - nowMs;
    const pulse = remaining > 0 ? 1 : 0;
    drawFood(ctx, state.bonus.cell.col, state.bonus.cell.row, cfg, nowMs, COLORS.bonus, pulse, true);
  }
  drawSnake(ctx, state, cfg);

  if (state.status === 'paused') drawOverlay(ctx, w, h, 'Paused', 'Space to resume');
  else if (state.status === 'gameover') {
    const cause = state.deathCause === 'wall' ? 'Hit a wall' : 'Bit yourself';
    drawOverlay(ctx, w, h, 'Game over', `${cause} — Enter to restart`);
  } else if (state.status === 'cleared') {
    drawOverlay(ctx, w, h, 'Board cleared!', 'Enter for a new game');
  } else if (state.status === 'idle') {
    drawOverlay(ctx, w, h, 'Snake', 'Arrows or WASD — Enter to start');
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, cfg: SnakeConfig): void {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cfg.cols; c++) {
    ctx.moveTo(c * cfg.cellSize + 0.5, 0);
    ctx.lineTo(c * cfg.cellSize + 0.5, cfg.rows * cfg.cellSize);
  }
  for (let r = 1; r < cfg.rows; r++) {
    ctx.moveTo(0, r * cfg.cellSize + 0.5);
    ctx.lineTo(cfg.cols * cfg.cellSize, r * cfg.cellSize + 0.5);
  }
  ctx.stroke();
}

function drawFood(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cfg: SnakeConfig,
  nowMs: number,
  color: string,
  intensity: number,
  isBonus = false,
): void {
  const cx = col * cfg.cellSize + cfg.cellSize / 2;
  const cy = row * cfg.cellSize + cfg.cellSize / 2;
  const period = isBonus ? 400 : 1000;
  const pulse = 0.85 + 0.15 * Math.sin((nowMs * 2 * Math.PI) / period);
  const baseR = (cfg.cellSize / 2) * 0.7;
  ctx.fillStyle = color;
  ctx.globalAlpha = intensity;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSnake(ctx: CanvasRenderingContext2D, state: SnakeState, cfg: SnakeConfig): void {
  const inset = Math.max(1, Math.floor(cfg.cellSize * 0.08));
  for (let i = state.body.length - 1; i >= 0; i--) {
    const s = state.body[i];
    ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
    ctx.fillRect(
      s.col * cfg.cellSize + inset,
      s.row * cfg.cellSize + inset,
      cfg.cellSize - inset * 2,
      cfg.cellSize - inset * 2,
    );
  }
  // Head chevron in the movement direction so the player can read the orientation
  // even when the snake is stationary at the start of a game.
  const head = state.body[0];
  const { dx, dy } = DELTA[state.direction];
  const cx = head.col * cfg.cellSize + cfg.cellSize / 2;
  const cy = head.row * cfg.cellSize + cfg.cellSize / 2;
  const r = cfg.cellSize * 0.18;
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath();
  ctx.arc(cx + dx * r * 1.2, cy + dy * r * 1.2, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  subtitle: string,
): void {
  ctx.fillStyle = COLORS.overlayBg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.hudFg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 14);
  ctx.fillStyle = COLORS.hudDim;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(subtitle, w / 2, h / 2 + 16);
}

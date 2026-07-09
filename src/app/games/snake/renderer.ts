import { DELTA } from '../../../core';
import type { SnakeConfig } from './config';
import { pixelFontFamily } from './sprites';
import type { SnakeState } from './types';

const COLORS = {
  bg: '#0b0d10',
  grid: '#1e3a4a',       // brand-deep tint — clearly visible against the bg
  gridMajor: '#27566d',  // brighter line every 5 cells for orientation
  gridBorder: '#8a8f99',
  food: '#e94e4e',
  bonus: '#ffd24a',
  body: '#3ec46d',
  head: '#5be089',
  hudFg: '#e6e6e6',
  hudDim: '#8a8f99',
  hudValue: '#ffd24a', // arcade yellow for live numbers
  hudBg: 'rgba(11, 13, 16, 0.55)',
  overlayBg: 'rgba(11, 13, 16, 0.78)',
} as const;

const pad = (n: number, w: number): string => n.toString().padStart(w, '0');
const HUD_HEIGHT = 28;
const HUD_LABEL_FONT_SIZE = 6;
const HUD_VALUE_FONT_SIZE = 8;
const HUD_PAD_X = 8;

export function render(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  cfg: SnakeConfig,
  hud: { highScore: number },
  nowMs: number,
  alpha = 0,
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
  // Interpolation freezes outside of active play — there's no fresh tick to
  // slide toward, so snapping to current cells matches the input being paused.
  const drawAlpha = state.status === 'playing' ? Math.max(0, Math.min(1, alpha)) : 0;
  drawSnake(ctx, state, cfg, drawAlpha);
  drawGridBorder(ctx, cfg);

  // In-canvas HUD — drawn on top of the board so it stays legible even when
  // the snake passes through the top row.
  drawHud(ctx, state, hud.highScore, cfg);

  if (state.status === 'paused') drawPauseOverlay(ctx, w, h, nowMs);
  else if (state.status === 'gameover') {
    const cause = state.deathCause === 'wall' ? 'Hit a wall' : 'Bit yourself';
    drawOverlay(ctx, w, h, 'Game over', `${cause} — Enter to restart`);
  } else if (state.status === 'cleared') {
    drawOverlay(ctx, w, h, 'Board cleared!', 'Enter for a new game');
  } else if (state.status === 'idle') {
    drawOverlay(ctx, w, h, 'Snake', 'Arrows or WASD — Enter to start');
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  highScore: number,
  cfg: SnakeConfig,
): void {
  const w = cfg.cols * cfg.cellSize;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(0, 0, w, HUD_HEIGHT);

  ctx.textBaseline = 'top';
  const fontFamily = pixelFontFamily();
  const labelFont = `${HUD_LABEL_FONT_SIZE}px ${fontFamily}`;
  const valueFont = `${HUD_VALUE_FONT_SIZE}px ${fontFamily}`;
  const labelY = 4;
  const valueY = 15;

  // SCORE (left).
  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'left';
  ctx.font = labelFont;
  ctx.fillText('SCORE', HUD_PAD_X, labelY);
  ctx.fillStyle = COLORS.hudValue;
  ctx.font = valueFont;
  ctx.fillText(pad(state.score, 6), HUD_PAD_X, valueY);

  // HIGH (centre).
  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'center';
  ctx.font = labelFont;
  ctx.fillText('HIGH', w / 2, labelY);
  ctx.fillStyle = COLORS.hudValue;
  ctx.font = valueFont;
  ctx.fillText(pad(highScore, 6), w / 2, valueY);

  // LENGTH (right).
  ctx.fillStyle = COLORS.hudDim;
  ctx.textAlign = 'right';
  ctx.font = labelFont;
  ctx.fillText('LENGTH', w - HUD_PAD_X, labelY);
  ctx.fillStyle = COLORS.hudValue;
  ctx.font = valueFont;
  ctx.fillText(pad(state.body.length, 3), w - HUD_PAD_X, valueY);
}

function drawGrid(ctx: CanvasRenderingContext2D, cfg: SnakeConfig): void {
  const w = cfg.cols * cfg.cellSize;
  const h = cfg.rows * cfg.cellSize;

  // Minor lines (every cell).
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cfg.cols; c++) {
    if (c % 5 === 0) continue; // major lines drawn separately
    ctx.moveTo(c * cfg.cellSize + 0.5, 0);
    ctx.lineTo(c * cfg.cellSize + 0.5, h);
  }
  for (let r = 1; r < cfg.rows; r++) {
    if (r % 5 === 0) continue;
    ctx.moveTo(0, r * cfg.cellSize + 0.5);
    ctx.lineTo(w, r * cfg.cellSize + 0.5);
  }
  ctx.stroke();

  // Major lines (every 5 cells) — brighter, helps gauge distance to the wall.
  ctx.strokeStyle = COLORS.gridMajor;
  ctx.beginPath();
  for (let c = 5; c < cfg.cols; c += 5) {
    ctx.moveTo(c * cfg.cellSize + 0.5, 0);
    ctx.lineTo(c * cfg.cellSize + 0.5, h);
  }
  for (let r = 5; r < cfg.rows; r += 5) {
    ctx.moveTo(0, r * cfg.cellSize + 0.5);
    ctx.lineTo(w, r * cfg.cellSize + 0.5);
  }
  ctx.stroke();
}

function drawGridBorder(ctx: CanvasRenderingContext2D, cfg: SnakeConfig): void {
  const w = cfg.cols * cfg.cellSize;
  const h = cfg.rows * cfg.cellSize;

  ctx.strokeStyle = COLORS.gridBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
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

function drawSnake(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  cfg: SnakeConfig,
  alpha: number,
): void {
  const inset = Math.max(1, Math.floor(cfg.cellSize * 0.08));
  const segSize = cfg.cellSize - inset * 2;

  // Ghost tail: the segment popped this tick slides from its old cell toward
  // the new tail's cell over the course of the next frame. Drawn behind the
  // live body (first, so subsequent fillRects layer on top).
  if (state.ghostTail) {
    const g = state.ghostTail;
    let x: number;
    let y: number;
    if (g.wrapped) {
      x = g.prevCol * cfg.cellSize + inset;
      y = g.prevRow * cfg.cellSize + inset;
    } else {
      x = lerp(g.prevCol, g.col, alpha) * cfg.cellSize + inset;
      y = lerp(g.prevRow, g.row, alpha) * cfg.cellSize + inset;
    }
    ctx.fillStyle = COLORS.body;
    ctx.fillRect(x, y, segSize, segSize);
  }

  for (let i = state.body.length - 1; i >= 0; i--) {
    const s = state.body[i];
    let cx: number;
    let cy: number;
    if (s.wrapped) {
      // Suppress interpolation across a wrap boundary — snap to current cell.
      cx = s.col * cfg.cellSize + inset;
      cy = s.row * cfg.cellSize + inset;
    } else {
      cx = lerp(s.prevCol, s.col, alpha) * cfg.cellSize + inset;
      cy = lerp(s.prevRow, s.row, alpha) * cfg.cellSize + inset;
    }
    ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
    ctx.fillRect(cx, cy, segSize, segSize);
  }
  // Head chevron in the movement direction so the player can read the orientation
  // even when the snake is stationary at the start of a game.
  const head = state.body[0];
  const headX = head.wrapped
    ? head.col * cfg.cellSize
    : lerp(head.prevCol, head.col, alpha) * cfg.cellSize;
  const headY = head.wrapped
    ? head.row * cfg.cellSize
    : lerp(head.prevRow, head.row, alpha) * cfg.cellSize;
  const { dx, dy } = DELTA[state.direction];
  const cx = headX + cfg.cellSize / 2;
  const cy = headY + cfg.cellSize / 2;
  const r = cfg.cellSize * 0.18;
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath();
  ctx.arc(cx + dx * r * 1.2, cy + dy * r * 1.2, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

function drawPauseOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  nowMs: number,
): void {
  const titleSize = 18;
  const fontFamily = pixelFontFamily();

  ctx.save();
  ctx.fillStyle = 'rgba(11, 13, 16, 0.7)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cy = h / 2;
  const titleY = cy - titleSize * 0.3;

  ctx.font = `${titleSize}px ${fontFamily}`;
  const titleW = ctx.measureText('PAUSED').width;

  // Pulsing chevron arrows flanking the title.
  const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowMs / 380));
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#4EB0D9';
  const chevronGap = titleSize * 0.9;
  const chevronSize = titleSize * 0.6;
  drawChevronArrow(ctx, w / 2 - titleW / 2 - chevronGap, titleY, chevronSize, 'right');
  drawChevronArrow(ctx, w / 2 + titleW / 2 + chevronGap, titleY, chevronSize, 'left');
  ctx.globalAlpha = 1;

  // Title.
  ctx.fillStyle = '#4EB0D9';
  ctx.fillText('PAUSED', w / 2, titleY);

  // Hint below.
  ctx.font = `7px ${fontFamily}`;
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('Space / P to resume · Esc to quit', w / 2, cy + titleSize * 1.1);

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

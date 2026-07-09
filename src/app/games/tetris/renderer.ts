import { dropY } from './board';
import { BUFFER_ROWS, COLS, PALETTE, type TetrisConfig } from './config';
import { pieceCells } from './pieces';
import type { ActivePiece, GameState, PieceType } from './types';

const BG = '#0b0d10';
const GRID_LINE = 'rgba(255,255,255,0.04)';

function darken(hex: string, amount: number): string {
  // hex format #RRGGBB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const k = 1 - amount;
  const dr = Math.max(0, Math.min(255, Math.round(r * k)));
  const dg = Math.max(0, Math.min(255, Math.round(g * k)));
  const db = Math.max(0, Math.min(255, Math.round(b * k)));
  return `rgb(${dr}, ${dg}, ${db})`;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  color: string,
  cell: number,
): void {
  // gy is grid y (with buffer); subtract BUFFER_ROWS for canvas y.
  const py = (gy - BUFFER_ROWS) * cell;
  if (py < -cell) return;
  const px = gx * cell;
  ctx.fillStyle = darken(color, 0.25);
  ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
}

function drawGhostCell(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  color: string,
  cell: number,
): void {
  const py = (gy - BUFFER_ROWS) * cell;
  if (py < -cell) return;
  const px = gx * cell;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
  ctx.restore();
}

export function renderPlayfield(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cfg: TetrisConfig,
): void {
  const cell = cfg.cellPx;
  const w = COLS * cell;
  const h = cfg.rows * cell;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Background grid lines.
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, h);
  }
  for (let y = 1; y < cfg.rows; y++) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(w, y * cell + 0.5);
  }
  ctx.stroke();

  // Locked stack — visible rows only.
  for (let gy = BUFFER_ROWS; gy < state.grid.length; gy++) {
    const row = state.grid[gy];
    for (let gx = 0; gx < COLS; gx++) {
      const c = row[gx];
      if (c === 0) continue;
      drawCell(ctx, gx, gy, PALETTE[c as PieceType], cell);
    }
  }

  // Ghost piece.
  const active = state.active;
  if (cfg.ghostEnabled && active && state.status === 'playing') {
    const gy = dropY(active, state.grid);
    if (gy > active.y) {
      const ghost: ActivePiece = { ...active, y: gy };
      const cells = pieceCells(ghost.type, ghost.rotation, ghost.x, ghost.y);
      for (const [x, y] of cells) {
        if (y >= BUFFER_ROWS - 1) drawGhostCell(ctx, x, y, PALETTE[ghost.type], cell);
      }
    }
  }

  // Active piece.
  if (active) {
    const cells = pieceCells(active.type, active.rotation, active.x, active.y);
    for (const [x, y] of cells) {
      if (y >= BUFFER_ROWS - 1) drawCell(ctx, x, y, PALETTE[active.type], cell);
    }
  }

  // Line clear flash.
  if (state.status === 'lineclear' && state.lineClearRows.length > 0) {
    const t = Math.max(0, Math.min(1, state.lineClearTimerMs / cfg.lineClearAnimMs));
    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle = '#ffffff';
    for (const gy of state.lineClearRows) {
      const py = (gy - BUFFER_ROWS) * cell;
      ctx.fillRect(0, py, w, cell);
    }
    ctx.restore();
  }

  // Pause / gameover overlay.
  if (state.status === 'paused') {
    drawPauseOverlay(ctx, w, h);
  } else if (state.status === 'gameover') {
    const reason = state.topOutReason === 'lock-out' ? 'Lock-out' : 'Block-out';
    drawOverlay(ctx, w, h, 'Game Over', `${reason} — Press Enter to retry`);
  } else if (state.status === 'idle') {
    drawOverlay(ctx, w, h, 'Tetris', 'Press Enter to play');
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  hint: string,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h / 2 - 12);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#bbbbbb';
  ctx.fillText(hint, w / 2, h / 2 + 16);
  ctx.restore();
}

function drawPauseOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const titleSize = 18;
  const fontFamily = '"Press Start 2P", monospace';

  ctx.save();
  ctx.fillStyle = 'rgba(11, 13, 16, 0.7)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cy = h / 2;
  const titleY = cy - titleSize * 0.3;

  ctx.font = `${titleSize}px ${fontFamily}`;
  const titleW = ctx.measureText('PAUSED').width;

  const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(nowMs / 380));
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#4EB0D9';
  const chevronGap = titleSize * 0.9;
  const chevronSize = titleSize * 0.6;
  drawChevronArrow(ctx, w / 2 - titleW / 2 - chevronGap, titleY, chevronSize, 'right');
  drawChevronArrow(ctx, w / 2 + titleW / 2 + chevronGap, titleY, chevronSize, 'left');
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#4EB0D9';
  ctx.fillText('PAUSED', w / 2, titleY);

  ctx.font = `7px ${fontFamily}`;
  ctx.fillStyle = '#8a8f99';
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

/** Render a single tetromino (in spawn orientation) inside a preview box. */
export function renderPreviewPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  originX: number,
  originY: number,
  cell: number,
): void {
  const offsets = pieceCells(type, 0, 0, 0);
  // Compute bounding box.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of offsets) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = (maxX - minX + 1) * cell;
  const h = (maxY - minY + 1) * cell;
  const ox = originX - w / 2;
  const oy = originY - h / 2;
  for (const [x, y] of offsets) {
    const px = ox + (x - minX) * cell;
    const py = oy + (y - minY) * cell;
    const color = PALETTE[type];
    ctx.fillStyle = darken(color, 0.25);
    ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
  }
}

/** Render the side-panel canvas with hold + next list. */
export function renderSidePanel(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cfg: TetrisConfig,
): void {
  const cell = cfg.previewCellPx;

  // We render: a "HOLD" box at top, then a "NEXT" list under it.
  const pad = 12;
  const boxW = 5 * cell;
  const boxH = 4 * cell;

  // HOLD
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(pad, pad, boxW, boxH);
  ctx.strokeStyle = '#2c3038';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, pad + 0.5, boxW, boxH);
  ctx.fillStyle = '#8a8f99';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HOLD', pad + 4, pad + 4);
  if (state.hold.piece && state.status !== 'paused') {
    ctx.globalAlpha = state.hold.locked ? 0.4 : 1;
    renderPreviewPiece(ctx, state.hold.piece, pad + boxW / 2, pad + boxH / 2 + 4, cell);
    ctx.globalAlpha = 1;
  }

  // NEXT
  const nextTop = pad + boxH + pad;
  const nextRowH = 3 * cell;
  const nextH = cfg.nextQueueLength * nextRowH + 18;
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(pad, nextTop, boxW, nextH);
  ctx.strokeStyle = '#2c3038';
  ctx.strokeRect(pad + 0.5, nextTop + 0.5, boxW, nextH);
  ctx.fillStyle = '#8a8f99';
  ctx.fillText('NEXT', pad + 4, nextTop + 4);
  if (state.status !== 'paused') {
    for (let i = 0; i < state.next.length && i < cfg.nextQueueLength; i++) {
      const cx = pad + boxW / 2;
      const cy = nextTop + 22 + i * nextRowH + nextRowH / 2 - 8;
      renderPreviewPiece(ctx, state.next[i], cx, cy, cell);
    }
  }
}

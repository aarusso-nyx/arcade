import type { Direction } from '../../../core';
import type { FruitType } from './types';

export const PIXEL_FONT = '"Press Start 2P", monospace';

let pixelFontPromise: Promise<void> | null = null;

export function loadPixelFont(): Promise<void> {
  if (pixelFontPromise) return pixelFontPromise;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    pixelFontPromise = Promise.resolve();
    return pixelFontPromise;
  }
  pixelFontPromise = document.fonts.load('8px "Press Start 2P"').then(
    () => void 0,
    () => void 0,
  );
  return pixelFontPromise;
}

export interface PacmanEyeOptions {
  readonly radius: number;
  readonly deathScale?: number;
}

export function drawPacmanEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  direction: Direction,
  options: PacmanEyeOptions,
): void {
  const scale = Math.max(0, options.deathScale ?? 1);
  if (scale <= 0) return;

  const eyeRadius = Math.max(0.35, options.radius * 0.2 * scale);
  const pupilRadius = Math.max(0.15, options.radius * 0.075 * scale);
  const back = oppositeUnit(direction);
  const forward = directionUnit(direction);
  const side = eyeSide(direction);
  const eyeDistance = options.radius * 0.38 * scale;
  const sideDistance = options.radius * 0.26 * scale;
  const pupilOffset = options.radius * 0.1 * scale;
  const ex = cx + back.x * eyeDistance + side.x * sideDistance;
  const ey = cy + back.y * eyeDistance + side.y * sideDistance;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(
    ex + forward.x * pupilOffset,
    ey + forward.y * pupilOffset,
    pupilRadius,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

export interface GhostSpriteOptions {
  readonly color: string;
  readonly direction: Direction;
  readonly frightened?: boolean;
  readonly flash?: boolean;
  readonly eaten?: boolean;
  readonly frame?: number;
}

export function drawGhostSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  options: GhostSpriteOptions,
): void {
  const unit = 1;

  if (options.eaten) {
    drawGhostEyes(ctx, cx, cy, unit, options.frame ?? 0);
    return;
  }

  const x = Math.round(cx - 5);
  const y = Math.round(cy - 5);
  const color = options.color;
  const alt = ((options.frame ?? 0) >> 3) % 2 === 1;
  const rows = alt
    ? [
        '..######..',
        '.########.',
        '##########',
        '##########',
        '##########',
        '##########',
        '##########',
        '##..##..##',
        '#...##...#',
        '#...##...#',
      ]
    : [
        '..######..',
        '.########.',
        '##########',
        '##########',
        '##########',
        '##########',
        '##########',
        '#..####..#',
        '#...##...#',
        '##..##..##',
      ];

  ctx.fillStyle = color;
  drawRows(ctx, x, y, unit, rows, '#');

  if (options.frightened) {
    const face = options.flash ? '#1a1aff' : '#ffffff';
    ctx.fillStyle = face;
    fillPixel(ctx, x, y, unit, 4, 5, 1, 1);
    fillPixel(ctx, x, y, unit, 9, 5, 1, 1);
    fillPixel(ctx, x, y, unit, 3, 9, 2, 1);
    fillPixel(ctx, x, y, unit, 6, 10, 2, 1);
    fillPixel(ctx, x, y, unit, 9, 9, 2, 1);
    return;
  }

  drawGhostEyes(ctx, cx, cy - 1, unit, options.frame ?? 0);
}

export function drawGhostEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  unit = 1,
  frame = 0,
): void {
  const x = Math.round(cx - 5 * unit);
  const y = Math.round(cy - 5 * unit);
  const corner = GHOST_EYE_CORNERS[Math.floor(frame / 10) % GHOST_EYE_CORNERS.length];

  ctx.fillStyle = '#ffffff';
  fillPixel(ctx, x, y, unit, 2, 2, 3, 4);
  fillPixel(ctx, x, y, unit, 6, 2, 3, 4);

  ctx.fillStyle = '#1a1aff';
  fillPixel(ctx, x, y, unit, 2 + corner.x, 2 + corner.y, 2, 2);
  fillPixel(ctx, x, y, unit, 6 + corner.x, 2 + corner.y, 2, 2);
}

const GHOST_EYE_CORNERS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 2 },
  { x: 0, y: 2 },
];

export function drawFruitSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: FruitType,
  size = 8,
): void {
  const unit = size / 8;
  const x = cx - size / 2;
  const y = cy - size / 2;

  switch (type) {
    case 'cherry':
      ctx.fillStyle = '#38d048';
      fillPixel(ctx, x, y, unit, 3, 0, 1, 4);
      fillPixel(ctx, x, y, unit, 4, 0, 2, 1);
      fillPixel(ctx, x, y, unit, 5, 1, 1, 2);
      ctx.fillStyle = '#ff2028';
      fillPixel(ctx, x, y, unit, 1, 4, 3, 3);
      fillPixel(ctx, x, y, unit, 5, 4, 2, 3);
      ctx.fillStyle = '#ffb0b8';
      fillPixel(ctx, x, y, unit, 2, 4, 1, 1);
      break;
    case 'strawberry':
      ctx.fillStyle = '#38d048';
      fillPixel(ctx, x, y, unit, 2, 1, 4, 1);
      fillPixel(ctx, x, y, unit, 3, 0, 2, 1);
      ctx.fillStyle = '#ff3048';
      fillPixel(ctx, x, y, unit, 2, 2, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 3, 6, 2);
      fillPixel(ctx, x, y, unit, 2, 5, 4, 1);
      fillPixel(ctx, x, y, unit, 3, 6, 2, 1);
      ctx.fillStyle = '#fff0d0';
      fillPixel(ctx, x, y, unit, 3, 3, 1, 1);
      fillPixel(ctx, x, y, unit, 5, 4, 1, 1);
      fillPixel(ctx, x, y, unit, 2, 5, 1, 1);
      break;
    case 'orange':
      ctx.fillStyle = '#38d048';
      fillPixel(ctx, x, y, unit, 4, 0, 2, 1);
      ctx.fillStyle = '#ff9c28';
      fillPixel(ctx, x, y, unit, 2, 2, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 3, 6, 3);
      fillPixel(ctx, x, y, unit, 2, 6, 4, 1);
      ctx.fillStyle = '#ffd080';
      fillPixel(ctx, x, y, unit, 2, 3, 1, 1);
      break;
    case 'apple':
      ctx.fillStyle = '#8a4c18';
      fillPixel(ctx, x, y, unit, 4, 0, 1, 2);
      ctx.fillStyle = '#40d060';
      fillPixel(ctx, x, y, unit, 5, 1, 2, 1);
      ctx.fillStyle = '#ff3030';
      fillPixel(ctx, x, y, unit, 2, 2, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 3, 6, 3);
      fillPixel(ctx, x, y, unit, 2, 6, 4, 1);
      ctx.fillStyle = '#ffb0b0';
      fillPixel(ctx, x, y, unit, 2, 3, 1, 1);
      break;
    case 'melon':
      ctx.fillStyle = '#2fb850';
      fillPixel(ctx, x, y, unit, 2, 1, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 2, 6, 4);
      fillPixel(ctx, x, y, unit, 2, 6, 4, 1);
      ctx.fillStyle = '#a8f070';
      fillPixel(ctx, x, y, unit, 2, 2, 1, 4);
      fillPixel(ctx, x, y, unit, 4, 2, 1, 4);
      fillPixel(ctx, x, y, unit, 6, 3, 1, 2);
      break;
    case 'galaxian':
      ctx.fillStyle = '#70a0ff';
      fillPixel(ctx, x, y, unit, 3, 0, 2, 2);
      fillPixel(ctx, x, y, unit, 2, 2, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 3, 6, 1);
      fillPixel(ctx, x, y, unit, 0, 4, 8, 1);
      ctx.fillStyle = '#ff3040';
      fillPixel(ctx, x, y, unit, 2, 5, 1, 2);
      fillPixel(ctx, x, y, unit, 5, 5, 1, 2);
      ctx.fillStyle = '#ffe860';
      fillPixel(ctx, x, y, unit, 3, 5, 2, 1);
      break;
    case 'bell':
      ctx.fillStyle = '#ffd840';
      fillPixel(ctx, x, y, unit, 3, 1, 2, 1);
      fillPixel(ctx, x, y, unit, 2, 2, 4, 1);
      fillPixel(ctx, x, y, unit, 1, 3, 6, 3);
      fillPixel(ctx, x, y, unit, 0, 6, 8, 1);
      ctx.fillStyle = '#b87818';
      fillPixel(ctx, x, y, unit, 3, 7, 2, 1);
      break;
    case 'key':
      ctx.fillStyle = '#ffe060';
      fillPixel(ctx, x, y, unit, 1, 1, 3, 3);
      ctx.fillStyle = '#000000';
      fillPixel(ctx, x, y, unit, 2, 2, 1, 1);
      ctx.fillStyle = '#ffe060';
      fillPixel(ctx, x, y, unit, 4, 2, 3, 1);
      fillPixel(ctx, x, y, unit, 6, 3, 1, 1);
      fillPixel(ctx, x, y, unit, 5, 4, 1, 1);
      break;
  }
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  rows: readonly string[],
  char: string,
): void {
  for (let yy = 0; yy < rows.length; yy++) {
    for (let xx = 0; xx < rows[yy].length; xx++) {
      if (rows[yy][xx] === char) fillPixel(ctx, x, y, unit, xx, yy, 1, 1);
    }
  }
}

function fillPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  ctx.fillRect(x + px * unit, y + py * unit, w * unit, h * unit);
}

function directionUnit(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
  }
}

function oppositeUnit(direction: Direction): { x: number; y: number } {
  const d = directionUnit(direction);
  return { x: -d.x, y: -d.y };
}

function eyeSide(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case 'left':
    case 'right':
      return { x: 0, y: -1 };
    case 'up':
      return { x: -1, y: 0 };
    case 'down':
      return { x: 1, y: 0 };
  }
}

import {
  CANVAS_W,
  HUD_TOP_H,
  TILE_SIZE,
  GRID_W,
  GRID_H,
  getFruitForLevel,
} from './config';
import type { Maze } from './maze';
import type {
  FruitType,
  Ghost,
  GhostId,
  Pacman,
  GameState,
} from './types';
import type { World } from './state';

const COLORS = {
  bg: '#000000',
  wall: '#1a1aff',
  wallEdge: '#3838ff',
  door: '#f6b4c7',
  pellet: '#ffe7b3',
  power: '#ffe7b3',
  pacman: '#ffe600',
  blinky: '#ff0000',
  pinky: '#ffb8de',
  inky: '#00ffe0',
  clyde: '#ffb851',
  frightened: '#1a1aff',
  frightenedFlash: '#ffffff',
  frightenedFace: '#ffe600',
  eyes: '#ffffff',
  pupil: '#1a1aff',
  hud: '#ffffff',
  hudDim: '#a0a0a0',
  ready: '#ffff00',
  gameOver: '#ff0000',
  fruit: {
    cherry: '#ff2020',
    strawberry: '#ff7080',
    orange: '#ffa040',
    apple: '#ff3030',
    melon: '#60d060',
    galaxian: '#a0a0ff',
    bell: '#ffd040',
    key: '#cccccc',
  } as Record<FruitType, string>,
} as const;

const GHOST_BODY_COLOR: Record<GhostId, string> = {
  blinky: COLORS.blinky,
  pinky: COLORS.pinky,
  inky: COLORS.inky,
  clyde: COLORS.clyde,
};

export interface MazeCache {
  /** Off-screen canvas with walls baked in. */
  surface: HTMLCanvasElement;
}

export function buildMazeCache(maze: Maze): MazeCache {
  const c = document.createElement('canvas');
  c.width = GRID_W * TILE_SIZE;
  c.height = GRID_H * TILE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) throw new Error('Canvas 2D context unavailable for maze cache');
  cx.fillStyle = COLORS.bg;
  cx.fillRect(0, 0, c.width, c.height);
  // Walls as filled square blocks with a subtle inner-edge highlight to evoke
  // the arcade's double-line corridors without going full neighbor analysis.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = maze.tiles[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (t.type === 'wall') {
        cx.fillStyle = COLORS.wall;
        cx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      } else if (t.type === 'door') {
        cx.fillStyle = COLORS.door;
        cx.fillRect(px, py + 3, TILE_SIZE, 2);
      }
    }
  }
  return { surface: c };
}

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  cache: MazeCache,
  nowMs: number,
  flashWhite: boolean,
): void {
  // Background already cleared by mount.beginFrame; HUD and playfield are drawn
  // in logical (1x) coords because the mount applied its scale transform.

  // Top HUD.
  drawTopHud(ctx, world.game);

  // Maze offset by top HUD height.
  ctx.save();
  ctx.translate(0, HUD_TOP_H);

  if (flashWhite) {
    // Draw a white-tinted copy of the cache by recolouring on the fly.
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (world.maze.tiles[y][x].type === 'wall') {
          ctx.fillRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }
  } else {
    ctx.drawImage(cache.surface, 0, 0);
    drawPellets(ctx, world, nowMs);
    drawFruit(ctx, world);
    drawPacman(ctx, world.pacman, world.game, nowMs);
    for (const g of world.ghosts) drawGhost(ctx, g, world.game, nowMs);
  }

  // Overlays inside the playfield.
  if (world.game.phase === 'ready') {
    drawCenterText(ctx, GRID_W * TILE_SIZE, GRID_H * TILE_SIZE, 'READY!', COLORS.ready);
  } else if (world.game.phase === 'gameover') {
    drawCenterText(ctx, GRID_W * TILE_SIZE, GRID_H * TILE_SIZE, 'GAME OVER', COLORS.gameOver);
  } else if (world.game.phase === 'paused') {
    drawCenterText(ctx, GRID_W * TILE_SIZE, GRID_H * TILE_SIZE, 'PAUSED', COLORS.hud);
  }
  ctx.restore();

  // Bottom HUD.
  drawBottomHud(ctx, world.game);
}

function drawTopHud(ctx: CanvasRenderingContext2D, game: GameState): void {
  ctx.fillStyle = COLORS.hud;
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('1UP', 24, 1);
  ctx.fillStyle = COLORS.hud;
  ctx.fillText(pad(game.score, 6), 8, 10);
  ctx.fillText('HIGH SCORE', 80, 1);
  ctx.fillText(pad(game.highScore, 6), 96, 10);
  ctx.textAlign = 'right';
  ctx.fillText(`L ${game.level}`, CANVAS_W - 4, 10);
}

function drawBottomHud(ctx: CanvasRenderingContext2D, game: GameState): void {
  const y = HUD_TOP_H + GRID_H * TILE_SIZE;
  // Lives icons.
  for (let i = 0; i < Math.max(0, game.lives - 1); i++) {
    const cx = 16 + i * 14;
    const cy = y + 6;
    ctx.fillStyle = COLORS.pacman;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0.2 * Math.PI, 1.8 * Math.PI);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
  }
  // Fruit indicator: show current level fruit only.
  const fx = CANVAS_W - 12;
  drawFruitIcon(ctx, fx, y + 6, getFruitForLevel(game.level), 5);
}

function drawPellets(ctx: CanvasRenderingContext2D, world: World, nowMs: number): void {
  const blink = Math.floor(nowMs / 250) % 2 === 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const v = world.pelletGrid[y * GRID_W + x];
      if (v === 0) continue;
      const cx = x * TILE_SIZE + TILE_SIZE / 2;
      const cy = y * TILE_SIZE + TILE_SIZE / 2;
      if (v === 1) {
        ctx.fillStyle = COLORS.pellet;
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
      } else if (v === 2 && blink) {
        ctx.fillStyle = COLORS.power;
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawFruit(ctx: CanvasRenderingContext2D, world: World): void {
  if (!world.game.fruit) return;
  const f = world.game.fruit;
  const cx = f.tile.tx * TILE_SIZE + TILE_SIZE / 2 + TILE_SIZE / 2;
  const cy = f.tile.ty * TILE_SIZE + TILE_SIZE / 2;
  drawFruitIcon(ctx, cx, cy, f.type, 4);
}

function drawFruitIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: FruitType,
  r: number,
): void {
  ctx.fillStyle = COLORS.fruit[type];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPacman(
  ctx: CanvasRenderingContext2D,
  pac: Pacman,
  game: GameState,
  _nowMs: number,
): void {
  const x = pac.position.x;
  const y = pac.position.y;

  if (game.phase === 'dying') {
    // Closing animation: angle shrinks from full circle to 0.
    const t = Math.max(0, Math.min(1, pac.deathFrame));
    const open = (1 - t) * Math.PI;
    if (open <= 0.05) return;
    ctx.fillStyle = COLORS.pacman;
    ctx.beginPath();
    ctx.arc(x, y, 5, open, Math.PI * 2 - open);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const cycle = Math.floor(pac.animFrame / 6) % 4; // 0..3
  const open = cycle === 0 ? 0 : cycle === 2 ? 0.35 * Math.PI : 0.18 * Math.PI;
  let baseAngle = 0;
  switch (pac.direction) {
    case 'right': baseAngle = 0; break;
    case 'down': baseAngle = Math.PI / 2; break;
    case 'left': baseAngle = Math.PI; break;
    case 'up': baseAngle = (3 * Math.PI) / 2; break;
  }
  ctx.fillStyle = COLORS.pacman;
  ctx.beginPath();
  ctx.arc(x, y, 5, baseAngle + open, baseAngle + Math.PI * 2 - open);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  game: GameState,
  _nowMs: number,
): void {
  const x = g.position.x;
  const y = g.position.y;

  if (g.state === 'eaten' || g.state === 'entering') {
    drawEyes(ctx, x, y, g.direction);
    return;
  }

  let bodyColor = GHOST_BODY_COLOR[g.id];
  if (g.state === 'frightened') {
    // Flash white during the warning phase: last `flashes` half-second segments
    // before fright timer expires.
    const flashes = 5;
    const flashTicksTotal = flashes * 30; // 30 ticks = 0.5s
    if (game.frightenedTimer < flashTicksTotal) {
      const half = Math.floor(g.animFrame / 14) % 2;
      bodyColor = half === 0 ? COLORS.frightened : COLORS.frightenedFlash;
    } else {
      bodyColor = COLORS.frightened;
    }
  }

  // Body.
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(x, y - 1, 5, Math.PI, 0); // top dome
  ctx.lineTo(x + 5, y + 4);
  // Wavy bottom.
  const wiggle = Math.floor(g.animFrame / 6) % 2;
  if (wiggle === 0) {
    ctx.lineTo(x + 3, y + 2);
    ctx.lineTo(x + 1, y + 4);
    ctx.lineTo(x - 1, y + 2);
    ctx.lineTo(x - 3, y + 4);
  } else {
    ctx.lineTo(x + 4, y + 2);
    ctx.lineTo(x + 2, y + 4);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - 2, y + 4);
  }
  ctx.lineTo(x - 5, y + 4);
  ctx.closePath();
  ctx.fill();

  if (g.state === 'frightened') {
    // Face: simple eyes and mouth on frightened color.
    ctx.fillStyle = COLORS.frightenedFace;
    ctx.fillRect(x - 2, y - 1, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
    ctx.fillRect(x - 2, y + 1, 1, 1);
    ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillRect(x + 2, y + 1, 1, 1);
  } else {
    drawEyes(ctx, x, y - 1, g.direction);
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Pacman['direction']): void {
  ctx.fillStyle = COLORS.eyes;
  ctx.fillRect(x - 3, y - 1, 2, 3);
  ctx.fillRect(x + 1, y - 1, 2, 3);
  ctx.fillStyle = COLORS.pupil;
  let dx = 0;
  let dy = 0;
  switch (dir) {
    case 'left': dx = -1; break;
    case 'right': dx = 1; break;
    case 'up': dy = -1; break;
    case 'down': dy = 1; break;
  }
  ctx.fillRect(x - 3 + (dx > 0 ? 1 : 0) + (dx < 0 ? 0 : 0), y - 1 + (dy > 0 ? 1 : 0) + (dy < 0 ? -1 : 0), 1, 2);
  ctx.fillRect(x + 1 + (dx > 0 ? 1 : 0) + (dx < 0 ? 0 : 0), y - 1 + (dy > 0 ? 1 : 0) + (dy < 0 ? -1 : 0), 1, 2);
}

function drawCenterText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 16);
}

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}


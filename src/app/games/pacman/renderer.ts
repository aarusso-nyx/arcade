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
  Ghost,
  GhostId,
  Pacman,
  GameState,
} from './types';
import type { World } from './state';
import {
  PIXEL_FONT,
  drawFruitSprite,
  drawGhostSprite,
  drawPacmanEye,
} from './sprites';

const ACTOR_RADIUS = 5;
const WALL_CONTOUR_OFFSET_PX = 0;

const COLORS = {
  bg: '#000000',
  wall: '#1a1aff',
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
  hud: '#ffffff',
  hudDim: '#a0a0a0',
  ready: '#ffff00',
  gameOver: '#ff0000',
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
  readonly wallShapes: readonly WallShape[];
}

export interface WallShape {
  readonly tx: number;
  readonly ty: number;
  /** 8-bit mask: NW,N,NE,W,E,SW,S,SE. */
  readonly neighbours: number;
}

const NeighbourBit = {
  NW: 1 << 0,
  N: 1 << 1,
  NE: 1 << 2,
  W: 1 << 3,
  E: 1 << 4,
  SW: 1 << 5,
  S: 1 << 6,
  SE: 1 << 7,
} as const;

export function buildMazeCache(maze: Maze): MazeCache {
  const c = document.createElement('canvas');
  c.width = GRID_W * TILE_SIZE;
  c.height = GRID_H * TILE_SIZE;
  const cx = c.getContext('2d');
  if (!cx) throw new Error('Canvas 2D context unavailable for maze cache');
  cx.fillStyle = COLORS.bg;
  cx.fillRect(0, 0, c.width, c.height);

  const wallShapes = buildWallShapes(maze);
  drawWallShapes(cx, wallShapes, COLORS.wall);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = maze.tiles[y][x];
      if (t.type === 'door') {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        cx.fillStyle = COLORS.door;
        cx.fillRect(px, py + 3, TILE_SIZE, 2);
      }
    }
  }
  return { surface: c, wallShapes };
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
    drawWallShapes(ctx, cache.wallShapes, '#ffffff');
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
  ctx.font = `6px ${PIXEL_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('1UP', 24, 1);
  ctx.fillStyle = COLORS.hud;
  ctx.font = `8px ${PIXEL_FONT}`;
  ctx.fillText(pad(game.score, 6), 8, 10);
  ctx.font = `6px ${PIXEL_FONT}`;
  ctx.fillText('HIGH SCORE', 80, 1);
  ctx.font = `8px ${PIXEL_FONT}`;
  ctx.fillText(pad(game.highScore, 6), 96, 10);
  ctx.textAlign = 'right';
  ctx.font = `6px ${PIXEL_FONT}`;
  ctx.fillText(`L ${game.level}`, CANVAS_W - 4, 10);
}

function drawBottomHud(ctx: CanvasRenderingContext2D, game: GameState): void {
  const y = HUD_TOP_H + GRID_H * TILE_SIZE;
  // Lives icons.
  for (let i = 0; i < Math.max(0, game.lives - 1); i++) {
    const cx = 16 + i * 12;
    const cy = y + 6;
    drawLifeChomp(ctx, cx, cy);
  }
  // Fruit indicator: show current level fruit only.
  const fx = CANVAS_W - 12;
  drawFruitSprite(ctx, fx, y + 6, getFruitForLevel(game.level), 7);
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
  drawFruitSprite(ctx, cx, cy, f.type, 8);
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
    const deathScale = 1 - t;
    if (open <= 0.05) return;
    ctx.fillStyle = COLORS.pacman;
    ctx.beginPath();
    ctx.arc(x, y, ACTOR_RADIUS * deathScale, open, Math.PI * 2 - open);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    drawPacmanEye(ctx, x, y, pac.direction, { radius: ACTOR_RADIUS, deathScale });
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
  ctx.arc(x, y, ACTOR_RADIUS, baseAngle + open, baseAngle + Math.PI * 2 - open);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  drawPacmanEye(ctx, x, y, pac.direction, { radius: ACTOR_RADIUS });
}

function drawLifeChomp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = COLORS.pacman;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0.22 * Math.PI, 1.78 * Math.PI);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  drawPacmanEye(ctx, x, y, 'right', { radius: 3.5 });
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
    drawGhostSprite(ctx, x, y, {
      color: '#ffffff',
      direction: g.direction,
      eaten: true,
      frame: g.animFrame,
    });
    return;
  }

  let bodyColor = GHOST_BODY_COLOR[g.id];
  let flashingFrightened = false;
  if (g.state === 'frightened') {
    // Flash white during the warning phase: last `flashes` half-second segments
    // before fright timer expires.
    const flashes = 5;
    const flashTicksTotal = flashes * 30; // 30 ticks = 0.5s
    if (game.frightenedTimer < flashTicksTotal) {
      const half = Math.floor(g.animFrame / 14) % 2;
      bodyColor = half === 0 ? COLORS.frightened : COLORS.frightenedFlash;
      flashingFrightened = half !== 0;
    } else {
      bodyColor = COLORS.frightened;
    }
  }

  drawGhostSprite(ctx, x, y, {
    color: bodyColor,
    direction: g.direction,
    frightened: g.state === 'frightened',
    flash: flashingFrightened,
    frame: g.animFrame,
  });
}

function drawCenterText(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = `10px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 16);
}

function buildWallShapes(maze: Maze): WallShape[] {
  const shapes: WallShape[] = [];
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      if (!isWall(maze, tx, ty)) continue;
      let neighbours = 0;
      if (isWall(maze, tx - 1, ty - 1)) neighbours |= NeighbourBit.NW;
      if (isWall(maze, tx, ty - 1)) neighbours |= NeighbourBit.N;
      if (isWall(maze, tx + 1, ty - 1)) neighbours |= NeighbourBit.NE;
      if (isWall(maze, tx - 1, ty)) neighbours |= NeighbourBit.W;
      if (isWall(maze, tx + 1, ty)) neighbours |= NeighbourBit.E;
      if (isWall(maze, tx - 1, ty + 1)) neighbours |= NeighbourBit.SW;
      if (isWall(maze, tx, ty + 1)) neighbours |= NeighbourBit.S;
      if (isWall(maze, tx + 1, ty + 1)) neighbours |= NeighbourBit.SE;
      shapes.push({ tx, ty, neighbours });
    }
  }
  return shapes;
}

function isWall(maze: Maze, tx: number, ty: number): boolean {
  return tx >= 0 && tx < GRID_W && ty >= 0 && ty < GRID_H && maze.tiles[ty][tx].type === 'wall';
}

function drawWallShapes(
  ctx: CanvasRenderingContext2D,
  shapes: readonly WallShape[],
  lineColor: string,
): void {
  ctx.save();
  ctx.beginPath();
  for (const shape of shapes) {
    ctx.rect(shape.tx * TILE_SIZE, shape.ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
  ctx.clip();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  for (const contour of buildWallContours(shapes)) {
    if (contour.length < 2) continue;
    const first = offsetWallPoint(contour[0], contour[0].from);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i < contour.length; i++) {
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      const end = offsetWallPoint(current, current.to);
      ctx.lineTo(end.x, end.y);
      if (next && samePoint(current.to, next.from)) {
        const nextStart = offsetWallPoint(next, next.from);
        ctx.lineTo(nextStart.x, nextStart.y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

interface WallPoint {
  readonly x: number;
  readonly y: number;
}

interface WallEdge {
  readonly from: WallPoint;
  readonly to: WallPoint;
}

function buildWallContours(shapes: readonly WallShape[]): WallEdge[][] {
  const edges: WallEdge[] = [];
  for (const shape of shapes) {
    const x = shape.tx;
    const y = shape.ty;
    const mask = shape.neighbours;
    if ((mask & NeighbourBit.N) === 0) {
      edges.push(edge(x, y, x + 1, y));
    }
    if ((mask & NeighbourBit.E) === 0) {
      edges.push(edge(x + 1, y, x + 1, y + 1));
    }
    if ((mask & NeighbourBit.S) === 0) {
      edges.push(edge(x + 1, y + 1, x, y + 1));
    }
    if ((mask & NeighbourBit.W) === 0) {
      edges.push(edge(x, y + 1, x, y));
    }
  }

  const byStart = new Map<string, WallEdge[]>();
  for (const e of edges) {
    const key = pointKey(e.from);
    const list = byStart.get(key);
    if (list) list.push(e);
    else byStart.set(key, [e]);
  }

  const contours: WallEdge[][] = [];
  while (edges.length > 0) {
    const first = edges.pop();
    if (!first) break;
    removeEdge(byStart, first);
    const contour: WallEdge[] = [first];
    let cursor = first.to;
    while (pointKey(cursor) !== pointKey(first.from)) {
      const next = takeNextEdge(byStart, cursor);
      if (!next) break;
      const index = edges.indexOf(next);
      if (index >= 0) edges.splice(index, 1);
      contour.push(next);
      cursor = next.to;
    }
    contours.push(contour);
  }
  return contours;
}

function edge(x1: number, y1: number, x2: number, y2: number): WallEdge {
  return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
}

function takeNextEdge(edges: Map<string, WallEdge[]>, point: WallPoint): WallEdge | null {
  const list = edges.get(pointKey(point));
  if (!list || list.length === 0) return null;
  const next = list.shift() ?? null;
  if (list.length === 0) edges.delete(pointKey(point));
  return next;
}

function removeEdge(edges: Map<string, WallEdge[]>, target: WallEdge): void {
  const key = pointKey(target.from);
  const list = edges.get(key);
  if (!list) return;
  const index = list.indexOf(target);
  if (index >= 0) list.splice(index, 1);
  if (list.length === 0) edges.delete(key);
}

function pointKey(p: WallPoint): string {
  return `${p.x},${p.y}`;
}

function samePoint(a: WallPoint, b: WallPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function offsetWallPoint(edge: WallEdge, point: WallPoint): WallPoint {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  return {
    x: point.x * TILE_SIZE - dy * WALL_CONTOUR_OFFSET_PX,
    y: point.y * TILE_SIZE + dx * WALL_CONTOUR_OFFSET_PX,
  };
}

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

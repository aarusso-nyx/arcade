import {
  DELTA,
  DIRECTIONS,
  OPPOSITE,
  type Direction,
  type RNG,
} from '../../../core';
import {
  TILE_SIZE,
  GRID_W,
  EXTRA_LIFE_THRESHOLD,
  EATEN_GHOST_SPEED,
  FRUIT_LIFETIME_TICKS_MAX,
  FRUIT_LIFETIME_TICKS_MIN,
  FRUIT_TRIGGER_THRESHOLDS,
  FRUIT_TILE,
  GHOST_CHAIN_POINTS,
  GHOST_HOUSE_DOOR_TILE,
  GLOBAL_RELEASE,
  HOME_CORNERS,
  LEVELCLEAR_TICKS,
  PELLET_POINTS,
  POWER_PELLET_POINTS,
  READY_TICKS,
  STARTING_LIVES,
  TICK_HZ,
  BLINKY_START_TILE,
  CLYDE_START_TILE,
  INKY_START_TILE,
  PINKY_START_TILE,
  CORNER_CUT_PIXELS,
  DYING_TOTAL_TICKS,
  DYING_FREEZE_TICKS,
  getElroyThresholds,
  getFrightTable,
  getFruitForLevel,
  getFruitPoints,
  getIdleReleaseTicks,
  getLevelSpeed,
  getPersonalThresholds,
} from './config';
import { isWalkableForGhost, isWalkableForPacman, type Maze } from './maze';
import { resetSchedule, tickSchedule, currentMode } from './schedule';
import {
  chaseTarget,
  eatenTarget,
  scatterTarget,
  type TargetContext,
} from './targeting';
import type {
  Ghost,
  GhostId,
  Pacman,
  TileVec,
  Vec2,
  GameState,
} from './types';

const HALF = TILE_SIZE / 2;

export function pixelToTile(p: Vec2): TileVec {
  return { tx: Math.floor(p.x / TILE_SIZE), ty: Math.floor(p.y / TILE_SIZE) };
}

export function tileCenter(t: TileVec): Vec2 {
  return { x: t.tx * TILE_SIZE + HALF, y: t.ty * TILE_SIZE + HALF };
}

export function buildPelletGrid(maze: Maze): Uint8Array {
  const grid = new Uint8Array(maze.width * maze.height);
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const t = maze.tiles[y][x];
      if (t.type === 'pellet') grid[y * maze.width + x] = 1;
      else if (t.type === 'power') grid[y * maze.width + x] = 2;
    }
  }
  return grid;
}

export function createInitialGameState(maze: Maze, highScore: number): GameState {
  return {
    level: 1,
    score: 0,
    highScore,
    lives: STARTING_LIVES,
    extraAwarded: false,
    pelletsRemaining: maze.pelletCount + maze.powerPelletCount,
    pelletsEatenThisLevel: 0,
    globalGhostCounter: 0,
    globalGhostCounterEnabled: false,
    ghostEatChain: 0,
    phase: 'ready',
    prePausePhase: null,
    phaseTimer: READY_TICKS,
    scheduleIndex: 0,
    schedulePhaseTicks: 0,
    scheduleFinal: false,
    frightenedTimer: 0,
    idleReleaseTicks: 0,
    fruit: null,
    fruitTriggered: { first: false, second: false },
    flashTicks: 0,
    elroy: 0,
  };
}

export function createPacman(): Pacman {
  // Pac-Man spawns centered on tile (13.5, 23) — between cols 13 and 14, row 23.
  return {
    position: { x: 14 * TILE_SIZE, y: 23 * TILE_SIZE + HALF },
    direction: 'left',
    nextDirection: null,
    animFrame: 0,
    deathFrame: 0,
    alive: true,
  };
}

export function createGhost(id: GhostId): Ghost {
  let spawnTile: readonly [number, number];
  switch (id) {
    case 'blinky': spawnTile = BLINKY_START_TILE; break;
    case 'pinky': spawnTile = PINKY_START_TILE; break;
    case 'inky': spawnTile = INKY_START_TILE; break;
    case 'clyde': spawnTile = CLYDE_START_TILE; break;
  }
  // Spawn straddles two horizontally adjacent tiles (px between two cols).
  const px = (spawnTile[0] + 1) * TILE_SIZE;
  const py = spawnTile[1] * TILE_SIZE + HALF;
  const [hx, hy] = HOME_CORNERS[id];
  return {
    id,
    homeCorner: { tx: hx, ty: hy },
    spawnPx: { x: px, y: py },
    position: { x: px, y: py },
    direction: id === 'blinky' ? 'left' : id === 'pinky' ? 'down' : id === 'inky' ? 'up' : 'up',
    state: id === 'blinky' ? 'scatter' : 'in-house',
    nextDirection: null,
    personalCounter: 0,
    hasLeftHouse: id === 'blinky',
    animFrame: 0,
    wasEatenThisChain: false,
  };
}

export function resetEntitiesForLife(pac: Pacman, ghosts: Ghost[]): void {
  const fresh = createPacman();
  pac.position = fresh.position;
  pac.direction = fresh.direction;
  pac.nextDirection = null;
  pac.animFrame = 0;
  pac.deathFrame = 0;
  pac.alive = true;
  ghosts.forEach((g) => {
    const f = createGhost(g.id);
    g.position = f.position;
    g.direction = f.direction;
    g.state = f.state;
    g.nextDirection = null;
    g.personalCounter = 0;
    g.hasLeftHouse = f.hasLeftHouse;
    g.animFrame = 0;
    g.wasEatenThisChain = false;
  });
}

export interface World {
  maze: Maze;
  pelletGrid: Uint8Array;
  game: GameState;
  pacman: Pacman;
  ghosts: Ghost[];
  rng: RNG;
}

export interface TickEvents {
  ateGhost: boolean;
  ateFruit: boolean;
  /** Plain pellet eaten this tick. Used to drive the waka-waka audio tick. */
  atePellet: boolean;
  atePowerPellet: boolean;
  died: boolean;
  levelCleared: boolean;
  extraLifeAwarded: boolean;
}

const emptyEvents = (): TickEvents => ({
  ateGhost: false,
  ateFruit: false,
  atePellet: false,
  atePowerPellet: false,
  died: false,
  levelCleared: false,
  extraLifeAwarded: false,
});

/* ───────────── Pac-Man movement ────────────────────────────────────────── */

/** Returns the pixel position adjusted by wrap if the entity exited the play field horizontally. */
function applyHorizontalWrap(pos: Vec2): Vec2 {
  const width = GRID_W * TILE_SIZE;
  if (pos.x < -HALF) return { x: width + HALF - 0.0001, y: pos.y };
  if (pos.x > width + HALF) return { x: -HALF + 0.0001, y: pos.y };
  return pos;
}

/** Snap to tile center along the axis perpendicular to `dir`. */
function snapPerpendicular(p: Vec2, dir: Direction): Vec2 {
  if (dir === 'left' || dir === 'right') {
    const ty = Math.round((p.y - HALF) / TILE_SIZE);
    return { x: p.x, y: ty * TILE_SIZE + HALF };
  }
  const tx = Math.round((p.x - HALF) / TILE_SIZE);
  return { x: tx * TILE_SIZE + HALF, y: p.y };
}

/**
 * Try to apply Pac-Man's buffered next direction. Returns true if applied.
 * The buffer applies if the perpendicular adjacent tile is walkable AND the
 * entity is within CORNER_CUT_PIXELS of its current tile center along the
 * direction of travel.
 */
function tryApplyTurnBuffer(world: World): boolean {
  const pac = world.pacman;
  const next = pac.nextDirection;
  if (!next) return false;
  if (next === pac.direction) {
    pac.nextDirection = null;
    return false;
  }
  const tile = pixelToTile(pac.position);

  // 180s are free anywhere.
  if (next === OPPOSITE[pac.direction]) {
    pac.direction = next;
    pac.nextDirection = null;
    return true;
  }
  // Otherwise must be near tile center and target tile must be walkable.
  const cx = pac.position.x - (tile.tx * TILE_SIZE + HALF);
  const cy = pac.position.y - (tile.ty * TILE_SIZE + HALF);
  const offAxis = pac.direction === 'left' || pac.direction === 'right' ? cx : cy;
  if (Math.abs(offAxis) > CORNER_CUT_PIXELS) return false;
  const { dx, dy } = DELTA[next];
  if (!isWalkableForPacman(world.maze, tile.tx + dx, tile.ty + dy)) return false;
  // Snap to centre on the perpendicular axis to keep movement on the grid.
  pac.position = snapPerpendicular(pac.position, next);
  pac.direction = next;
  pac.nextDirection = null;
  return true;
}

function movePacman(world: World): void {
  const pac = world.pacman;
  if (!pac.alive) return;

  tryApplyTurnBuffer(world);

  const speed = currentPacmanSpeed(world);
  const { dx, dy } = DELTA[pac.direction];
  let nx = pac.position.x + dx * speed;
  let ny = pac.position.y + dy * speed;

  // Wall block: clamp to the centre of the current tile when the next tile
  // along the axis of motion is not walkable. The check uses the *current*
  // tile so a Pac-Man already inside a corridor cannot tunnel into a wall.
  const currentTile = pixelToTile(pac.position);
  const aheadTx = currentTile.tx + dx;
  const aheadTy = currentTile.ty + dy;
  if (!isWalkableForPacman(world.maze, aheadTx, aheadTy)) {
    const tileCx = currentTile.tx * TILE_SIZE + HALF;
    const tileCy = currentTile.ty * TILE_SIZE + HALF;
    if (dx > 0 && nx > tileCx) nx = tileCx;
    else if (dx < 0 && nx < tileCx) nx = tileCx;
    if (dy > 0 && ny > tileCy) ny = tileCy;
    else if (dy < 0 && ny < tileCy) ny = tileCy;
  }

  pac.position = applyHorizontalWrap({ x: nx, y: ny });
  pac.animFrame++;
}

function currentPacmanSpeed(world: World): number {
  const t = getLevelSpeed(world.game.level);
  return world.game.frightenedTimer > 0 ? t.pacFrightened : t.pacNormal;
}

/* ───────────── Ghost movement ──────────────────────────────────────────── */

function currentGhostSpeed(world: World, g: Ghost): number {
  if (g.state === 'eaten' || g.state === 'entering') return EATEN_GHOST_SPEED;
  const t = getLevelSpeed(world.game.level);
  if (g.state === 'frightened') return t.ghostFrightened;
  const tile = pixelToTile(g.position);
  const tileEntry = world.maze.tiles[tile.ty]?.[tile.tx];
  if (tileEntry?.isSlowZone) return t.ghostTunnel;
  if (g.state === 'in-house' || g.state === 'leaving') return t.ghostFrightened; // slow inside house
  if (g.id === 'blinky' && world.game.elroy === 2) return t.elroy2;
  if (g.id === 'blinky' && world.game.elroy === 1) return t.elroy1;
  return t.ghostNormal;
}

/**
 * Choose the next direction for the ghost at the tile center of `tile`.
 * Implements the canonical decision rule from spec § 4.3.
 */
export function chooseGhostDirection(
  world: World,
  g: Ghost,
  tile: TileVec,
  target: TileVec,
): Direction {
  const tileEntry = world.maze.tiles[tile.ty]?.[tile.tx];
  const isNoUp =
    tileEntry?.isNoUpZone === true &&
    (g.state === 'scatter' || g.state === 'chase');

  const allowDoor = g.state === 'eaten' || g.state === 'entering' || g.state === 'leaving';
  const allowHouse = g.state === 'eaten' || g.state === 'entering' || g.state === 'in-house' || g.state === 'leaving';
  const opp = OPPOSITE[g.direction];

  const candidates: Direction[] = [];
  for (const d of DIRECTIONS) {
    if (d === opp) continue;
    if (d === 'up' && isNoUp) continue;
    const { dx, dy } = DELTA[d];
    if (!isWalkableForGhost(world.maze, tile.tx + dx, tile.ty + dy, { allowDoor, allowHouse })) {
      continue;
    }
    candidates.push(d);
  }

  if (candidates.length === 0) {
    // Forced reverse (dead-end shaped corridor).
    return opp;
  }

  if (g.state === 'frightened') {
    const idx = Math.floor(world.rng() * candidates.length);
    return candidates[idx];
  }

  // Tiebreak order: up, left, down, right.
  const tiebreakOrder: Record<Direction, number> = { up: 0, left: 1, down: 2, right: 3 };
  let best: Direction | null = null;
  let bestDist = Infinity;
  let bestTb = Infinity;
  for (const d of candidates) {
    const { dx, dy } = DELTA[d];
    const ntx = tile.tx + dx;
    const nty = tile.ty + dy;
    const dx2 = ntx - target.tx;
    const dy2 = nty - target.ty;
    const dist = dx2 * dx2 + dy2 * dy2;
    const tb = tiebreakOrder[d];
    if (dist < bestDist || (dist === bestDist && tb < bestTb)) {
      best = d;
      bestDist = dist;
      bestTb = tb;
    }
  }
  return best ?? candidates[0];
}

function ghostTargetFor(world: World, g: Ghost): TileVec {
  if (g.state === 'eaten' || g.state === 'entering') return eatenTarget();
  if (g.state === 'scatter') {
    // Blinky in Elroy mode ignores scatter target — he chases.
    if (g.id === 'blinky' && world.game.elroy > 0) {
      return chaseTargetForGhost(world, g);
    }
    return scatterTarget(g.id);
  }
  if (g.state === 'chase') return chaseTargetForGhost(world, g);
  // frightened/in-house/leaving: target unused (frightened picks random; house uses scripted movement).
  return { tx: 0, ty: 0 };
}

function chaseTargetForGhost(world: World, g: Ghost): TileVec {
  const pac = world.pacman;
  const blinky = world.ghosts.find((x) => x.id === 'blinky')!;
  const ctx: TargetContext = {
    pacTile: pixelToTile(pac.position),
    pacDir: pac.direction,
    blinkyTile: pixelToTile(blinky.position),
    ghostTile: pixelToTile(g.position),
  };
  return chaseTarget(g.id, ctx);
}

/* ───────────── Ghost house & releases ──────────────────────────────────── */

function thresholdFor(world: World, id: Exclude<GhostId, 'blinky'>): number {
  const personal = getPersonalThresholds(world.game.level);
  return id === 'pinky' ? personal.pinky : id === 'inky' ? personal.inky : personal.clyde;
}

function tryReleaseFromHouse(world: World): void {
  // Order: pinky, inky, clyde. Process at most one per tick to honor the queue.
  const order: GhostId[] = ['pinky', 'inky', 'clyde'];
  for (const id of order) {
    const g = world.ghosts.find((x) => x.id === id)!;
    if (g.state !== 'in-house') continue;

    let release = false;
    if (world.game.globalGhostCounterEnabled) {
      const globalThreshold =
        id === 'pinky' ? GLOBAL_RELEASE.pinky :
        id === 'inky' ? GLOBAL_RELEASE.inky :
        GLOBAL_RELEASE.clyde;
      if (world.game.globalGhostCounter >= globalThreshold) {
        release = true;
        // Once Clyde leaves, disable global counter.
        if (id === 'clyde') {
          world.game.globalGhostCounterEnabled = false;
          world.game.globalGhostCounter = 0;
        }
      }
    } else if (g.personalCounter >= thresholdFor(world, id as Exclude<GhostId, 'blinky'>)) {
      release = true;
    }
    if (world.game.idleReleaseTicks >= getIdleReleaseTicks(world.game.level)) {
      release = true;
      world.game.idleReleaseTicks = 0;
    }
    if (release) {
      g.state = 'leaving';
      // Heading up out of the door.
      g.direction = 'up';
      g.nextDirection = null;
    }
    // Only consider one ghost per tick (the queue head).
    return;
  }
}

function scriptedHouseMove(world: World, g: Ghost): void {
  // Inside the house, ghosts bob up/down between two rows (rows 14 and 15 area).
  // For simplicity (and to keep things deterministic for tests), bob the ghost
  // between y ≈ row 14 and y ≈ row 15 within ±4 px of its spawn position.
  const speed = currentGhostSpeed(world, g);
  const spawnY = g.spawnPx.y;
  const upper = spawnY - 4;
  const lower = spawnY + 4;
  if (g.direction !== 'up' && g.direction !== 'down') g.direction = 'up';
  g.position.y += (g.direction === 'up' ? -1 : 1) * speed;
  if (g.position.y <= upper) {
    g.position.y = upper;
    g.direction = 'down';
  } else if (g.position.y >= lower) {
    g.position.y = lower;
    g.direction = 'up';
  }
  // Stay aligned horizontally.
  g.position.x = g.spawnPx.x;
}

function leavingHouseMove(world: World, g: Ghost): void {
  // Move horizontally to the door column (14*TILE_SIZE = 112 px), then up to row 11 center.
  const speed = currentGhostSpeed(world, g);
  const doorX = 14 * TILE_SIZE; // center of door
  const exitY = 11 * TILE_SIZE + HALF;

  if (Math.abs(g.position.x - doorX) > 0.001) {
    const step = Math.sign(doorX - g.position.x) * Math.min(speed, Math.abs(doorX - g.position.x));
    g.position.x += step;
    g.direction = step > 0 ? 'right' : 'left';
    return;
  }
  // Now move up.
  g.direction = 'up';
  g.position.y -= speed;
  if (g.position.y <= exitY) {
    g.position.y = exitY;
    g.hasLeftHouse = true;
    // Adopt the current mode; frightened still active overrides to frightened.
    g.state = world.game.frightenedTimer > 0 ? 'frightened' : currentMode(world.game);
    g.direction = 'left';
    g.nextDirection = null;
  }
}

function enteringHouseMove(world: World, g: Ghost): void {
  // Eyes have reached the door; descend into the house and re-spawn.
  const speed = currentGhostSpeed(world, g);
  const doorX = 14 * TILE_SIZE;
  const targetY = g.spawnPx.y;
  if (Math.abs(g.position.x - doorX) > 0.001) {
    const step = Math.sign(doorX - g.position.x) * Math.min(speed, Math.abs(doorX - g.position.x));
    g.position.x += step;
    g.direction = step > 0 ? 'right' : 'left';
    return;
  }
  // Move down.
  g.direction = 'down';
  g.position.y += speed;
  if (g.position.y >= targetY) {
    g.position.y = targetY;
    // Move horizontally to spawn x.
    if (Math.abs(g.position.x - g.spawnPx.x) > speed) {
      g.position.x += Math.sign(g.spawnPx.x - g.position.x) * speed;
      g.direction = g.spawnPx.x > g.position.x ? 'right' : 'left';
      return;
    }
    g.position.x = g.spawnPx.x;
    g.state = 'in-house';
    g.direction = 'up';
    g.personalCounter = 0;
  }
}

/* ───────────── Ghost tick ─────────────────────────────────────────────── */

function moveGhostInMaze(world: World, g: Ghost): void {
  const speed = currentGhostSpeed(world, g);
  const { dx, dy } = DELTA[g.direction];

  // Determine the entity tile.
  const beforeTile = pixelToTile(g.position);

  // Advance position.
  let nx = g.position.x + dx * speed;
  let ny = g.position.y + dy * speed;
  g.position = applyHorizontalWrap({ x: nx, y: ny });

  // Check whether we've crossed into a new tile center along the axis of motion.
  // We use tile center crossings for ghost direction decisions.
  const afterTile = pixelToTile(g.position);
  if (afterTile.tx !== beforeTile.tx || afterTile.ty !== beforeTile.ty) {
    // Reached a new tile — decide direction for the next move. For arcade
    // fidelity, ghosts decide based on the tile they are entering.
    const target = ghostTargetFor(world, g);
    const nextDir = chooseGhostDirection(world, g, afterTile, target);
    // Snap onto the new tile centre so subsequent moves stay grid-aligned.
    g.position = {
      x: afterTile.tx * TILE_SIZE + HALF,
      y: afterTile.ty * TILE_SIZE + HALF,
    };
    g.direction = nextDir;

    // Eaten ghost reaching door: transition to entering.
    if (g.state === 'eaten') {
      const [doorX, doorY] = GHOST_HOUSE_DOOR_TILE;
      if (afterTile.tx === doorX || afterTile.tx === doorX + 1) {
        if (afterTile.ty === doorY) {
          g.state = 'entering';
        }
      }
    }
  }
  g.animFrame++;
}

function reverseEligibleGhosts(world: World): void {
  for (const g of world.ghosts) {
    if (g.state === 'scatter' || g.state === 'chase' || g.state === 'frightened') {
      g.direction = OPPOSITE[g.direction];
    }
  }
}

/* ───────────── Pellet / fruit / collisions ─────────────────────────────── */

function eatPellet(world: World, events: TickEvents): void {
  const pac = world.pacman;
  const tile = pixelToTile(pac.position);
  const idx = tile.ty * world.maze.width + tile.tx;
  const cell = world.pelletGrid[idx];
  if (cell === 0) return;
  // Pac-Man center must be within HALF (4px) of the tile center to "eat".
  const cx = tile.tx * TILE_SIZE + HALF;
  const cy = tile.ty * TILE_SIZE + HALF;
  if (Math.abs(pac.position.x - cx) > HALF || Math.abs(pac.position.y - cy) > HALF) return;

  if (cell === 1) {
    world.pelletGrid[idx] = 0;
    world.game.score += PELLET_POINTS;
    world.game.pelletsRemaining--;
    world.game.pelletsEatenThisLevel++;
    world.game.idleReleaseTicks = 0;
    bumpHouseCounter(world);
    events.atePellet = true;
  } else if (cell === 2) {
    world.pelletGrid[idx] = 0;
    world.game.score += POWER_PELLET_POINTS;
    world.game.pelletsRemaining--;
    world.game.pelletsEatenThisLevel++;
    world.game.idleReleaseTicks = 0;
    bumpHouseCounter(world);
    events.atePowerPellet = true;
    const fright = getFrightTable(world.game.level);
    if (fright.seconds > 0) {
      // Reset chain.
      world.game.ghostEatChain = 0;
      world.ghosts.forEach((g) => { g.wasEatenThisChain = false; });
      // Flip eligible ghosts to frightened and reverse direction.
      for (const g of world.ghosts) {
        if (g.state === 'scatter' || g.state === 'chase') {
          g.state = 'frightened';
          g.direction = OPPOSITE[g.direction];
        } else if (g.state === 'leaving') {
          // leaving ghosts flip when they exit (handled implicitly: when leaving completes,
          // we adopt currentMode); set frightened on exit by storing the timer.
        }
      }
      world.game.frightenedTimer = Math.round(fright.seconds * TICK_HZ);
    } else {
      // Even with no frightened, ghosts still reverse direction (per gameplay.md).
      reverseEligibleGhosts(world);
    }
  }

  // Extra life.
  if (!world.game.extraAwarded && world.game.score >= EXTRA_LIFE_THRESHOLD) {
    world.game.lives++;
    world.game.extraAwarded = true;
    events.extraLifeAwarded = true;
  }

  // Update Blinky's Elroy status.
  updateElroy(world);

  // Fruit triggers.
  if (!world.game.fruitTriggered.first && world.game.pelletsEatenThisLevel >= FRUIT_TRIGGER_THRESHOLDS[0]) {
    spawnFruit(world);
    world.game.fruitTriggered.first = true;
  } else if (!world.game.fruitTriggered.second && world.game.pelletsEatenThisLevel >= FRUIT_TRIGGER_THRESHOLDS[1]) {
    spawnFruit(world);
    world.game.fruitTriggered.second = true;
  }
}

function bumpHouseCounter(world: World): void {
  if (world.game.globalGhostCounterEnabled) {
    world.game.globalGhostCounter++;
    return;
  }
  // Personal counter goes to the next ghost in queue still in the house.
  const order: GhostId[] = ['pinky', 'inky', 'clyde'];
  for (const id of order) {
    const g = world.ghosts.find((x) => x.id === id)!;
    if (g.state === 'in-house') {
      g.personalCounter++;
      return;
    }
  }
}

function updateElroy(world: World): void {
  const remaining = world.game.pelletsRemaining;
  const t = getElroyThresholds(world.game.level);
  if (remaining <= t.elroy2) world.game.elroy = 2;
  else if (remaining <= t.elroy1) world.game.elroy = 1;
  else world.game.elroy = 0;
}

function spawnFruit(world: World): void {
  const lifetime =
    FRUIT_LIFETIME_TICKS_MIN +
    Math.floor(world.rng() * (FRUIT_LIFETIME_TICKS_MAX - FRUIT_LIFETIME_TICKS_MIN));
  const [tx, ty] = FRUIT_TILE;
  world.game.fruit = {
    tile: { tx, ty },
    type: getFruitForLevel(world.game.level),
    ticksRemaining: lifetime,
  };
}

function checkFruit(world: World, events: TickEvents): void {
  if (!world.game.fruit) return;
  world.game.fruit.ticksRemaining--;
  if (world.game.fruit.ticksRemaining <= 0) {
    world.game.fruit = null;
    return;
  }
  const pac = world.pacman;
  const tile = pixelToTile(pac.position);
  if (tile.tx === world.game.fruit.tile.tx && tile.ty === world.game.fruit.tile.ty) {
    world.game.score += getFruitPoints(world.game.level);
    world.game.fruit = null;
    events.ateFruit = true;
  }
}

function checkGhostCollisions(world: World, events: TickEvents): void {
  const pacTile = pixelToTile(world.pacman.position);
  for (const g of world.ghosts) {
    if (g.state === 'eaten' || g.state === 'entering' || g.state === 'in-house' || g.state === 'leaving') continue;
    const gTile = pixelToTile(g.position);
    if (gTile.tx !== pacTile.tx || gTile.ty !== pacTile.ty) continue;
    if (g.state === 'frightened') {
      g.state = 'eaten';
      g.wasEatenThisChain = true;
      const chainIdx = Math.min(world.game.ghostEatChain, GHOST_CHAIN_POINTS.length - 1);
      world.game.score += GHOST_CHAIN_POINTS[chainIdx];
      world.game.ghostEatChain = Math.min(4, world.game.ghostEatChain + 1) as GameState['ghostEatChain'];
      events.ateGhost = true;
    } else {
      // Death.
      world.pacman.alive = false;
      events.died = true;
      return;
    }
  }
}

/* ───────────── Top-level tick ──────────────────────────────────────────── */

export function tickWorld(world: World): TickEvents {
  const events = emptyEvents();

  // Phase machinery: ready / dying / levelclear pre-empt the simulation.
  if (world.game.phase === 'ready') {
    world.game.phaseTimer--;
    if (world.game.phaseTimer <= 0) {
      world.game.phase = 'playing';
    }
    return events;
  }
  if (world.game.phase === 'dying') {
    world.game.phaseTimer--;
    if (world.game.phaseTimer > DYING_TOTAL_TICKS - DYING_FREEZE_TICKS) {
      // Freeze frame.
    } else {
      // Animate death — caller's renderer uses deathFrame.
      world.pacman.deathFrame = 1 - world.game.phaseTimer / (DYING_TOTAL_TICKS - DYING_FREEZE_TICKS);
    }
    if (world.game.phaseTimer <= 0) {
      world.game.lives--;
      if (world.game.lives <= 0) {
        world.game.phase = 'gameover';
      } else {
        // Reset for next life.
        resetEntitiesForLife(world.pacman, world.ghosts);
        world.game.ghostEatChain = 0;
        world.game.frightenedTimer = 0;
        world.game.globalGhostCounterEnabled = true;
        world.game.globalGhostCounter = 0;
        world.game.idleReleaseTicks = 0;
        world.game.phase = 'ready';
        world.game.phaseTimer = READY_TICKS;
        resetSchedule(world.game);
      }
    }
    return events;
  }
  if (world.game.phase === 'levelclear') {
    world.game.phaseTimer--;
    if (world.game.phaseTimer <= 0) {
      // Advance level.
      world.game.level++;
      world.game.pelletsRemaining = world.maze.pelletCount + world.maze.powerPelletCount;
      world.game.pelletsEatenThisLevel = 0;
      world.game.fruit = null;
      world.game.fruitTriggered = { first: false, second: false };
      world.game.ghostEatChain = 0;
      world.game.frightenedTimer = 0;
      world.game.elroy = 0;
      // Refill pellet grid.
      const grid = buildPelletGrid(world.maze);
      world.pelletGrid.set(grid);
      resetEntitiesForLife(world.pacman, world.ghosts);
      resetSchedule(world.game);
      world.game.phase = 'ready';
      world.game.phaseTimer = READY_TICKS;
    }
    return events;
  }
  if (world.game.phase === 'gameover' || world.game.phase === 'paused' || world.game.phase === 'attract') {
    return events;
  }

  // PLAYING.
  // Idle release timer.
  world.game.idleReleaseTicks++;

  // Schedule.
  const flipped = tickSchedule(world.game);
  if (flipped) {
    // Reverse eligible ghosts and update their high-level state to match new mode.
    const newMode = currentMode(world.game);
    for (const g of world.ghosts) {
      if (g.state === 'scatter' || g.state === 'chase') {
        g.state = newMode;
        g.direction = OPPOSITE[g.direction];
      }
    }
  }

  // Frightened timer.
  if (world.game.frightenedTimer > 0) {
    world.game.frightenedTimer--;
    if (world.game.frightenedTimer === 0) {
      // Revert frightened ghosts to current mode (no direction reverse).
      const mode = currentMode(world.game);
      for (const g of world.ghosts) {
        if (g.state === 'frightened') g.state = mode;
        g.wasEatenThisChain = false;
      }
      world.game.ghostEatChain = 0;
    }
  }

  // Move Pac-Man, eat pellets, check fruit.
  movePacman(world);
  eatPellet(world, events);
  checkFruit(world, events);

  // Try to release ghosts.
  tryReleaseFromHouse(world);

  // Move ghosts.
  for (const g of world.ghosts) {
    if (g.state === 'in-house') scriptedHouseMove(world, g);
    else if (g.state === 'leaving') leavingHouseMove(world, g);
    else if (g.state === 'entering') enteringHouseMove(world, g);
    else moveGhostInMaze(world, g);
  }

  // Collisions.
  checkGhostCollisions(world, events);

  if (events.died) {
    world.game.phase = 'dying';
    world.game.phaseTimer = DYING_TOTAL_TICKS;
    world.pacman.deathFrame = 0;
  }

  // Level clear.
  if (world.game.pelletsRemaining <= 0) {
    world.game.phase = 'levelclear';
    world.game.phaseTimer = LEVELCLEAR_TICKS;
    events.levelCleared = true;
  }

  return events;
}

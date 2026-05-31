import type { Direction } from '../../../core';

export type TileType =
  | 'wall'
  | 'empty'
  | 'pellet'
  | 'power'
  | 'door'
  | 'house'
  | 'tunnel';

export interface Tile {
  type: TileType;
  isIntersection: boolean;
  isTunnel: boolean;
  isSlowZone: boolean;
  isNoUpZone: boolean;
}

export interface Maze {
  width: number;
  height: number;
  tiles: Tile[][];
  pelletCount: number;
  powerPelletCount: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface TileVec {
  tx: number;
  ty: number;
}

export type GhostId = 'blinky' | 'pinky' | 'inky' | 'clyde';

export type GhostState =
  | 'in-house'
  | 'leaving'
  | 'scatter'
  | 'chase'
  | 'frightened'
  | 'eaten'
  | 'entering';

export interface Ghost {
  id: GhostId;
  homeCorner: TileVec;
  spawnPx: Vec2;
  position: Vec2;
  direction: Direction;
  state: GhostState;
  /** Direction selected for the next tile while traversing the current one. */
  nextDirection: Direction | null;
  /** Per-ghost pellet counter for house release. */
  personalCounter: number;
  /** True once the ghost has left the house at least once on this life. */
  hasLeftHouse: boolean;
  /** Frame counter for leg animation. */
  animFrame: number;
  /** True if Pac-Man ate this ghost during the current power window (chain incremented). */
  wasEatenThisChain: boolean;
}

export interface Pacman {
  position: Vec2;
  direction: Direction;
  /** Buffered direction the player pressed; tried each tick until satisfied. */
  nextDirection: Direction | null;
  animFrame: number;
  /** 0..1 progress through the death animation; only meaningful when phase==='dying'. */
  deathFrame: number;
  alive: boolean;
}

export type FruitType =
  | 'cherry'
  | 'strawberry'
  | 'orange'
  | 'apple'
  | 'melon'
  | 'galaxian'
  | 'bell'
  | 'key';

export interface Fruit {
  tile: TileVec;
  type: FruitType;
  ticksRemaining: number;
}

export type GamePhase =
  | 'attract'
  | 'ready'
  | 'playing'
  | 'dying'
  | 'levelclear'
  | 'gameover'
  | 'paused';

export interface GameState {
  level: number;
  score: number;
  highScore: number;
  lives: number;
  extraAwarded: boolean;
  pelletsRemaining: number;
  pelletsEatenThisLevel: number;
  globalGhostCounter: number;
  globalGhostCounterEnabled: boolean;
  /** 0 means no power window active. Otherwise the count of ghosts eaten so far in the current chain (1..4). */
  ghostEatChain: 0 | 1 | 2 | 3 | 4;
  phase: GamePhase;
  /** Phase whose loop continues under the hood while paused — restored on resume. */
  prePausePhase: GamePhase | null;
  /** Ticks remaining in the current phase (ready, dying, levelclear). */
  phaseTimer: number;
  /** Index into the schedule array. */
  scheduleIndex: number;
  /** Ticks elapsed in the current schedule phase. */
  schedulePhaseTicks: number;
  /** True when scheduleIndex points past the last finite phase (chase forever). */
  scheduleFinal: boolean;
  /** Ticks of frightened remaining (0 if not frightened). */
  frightenedTimer: number;
  /** Ticks since Pac-Man last ate a pellet (for idle-release timer). */
  idleReleaseTicks: number;
  fruit: Fruit | null;
  /** Pellet eat counter for fruit triggers (only 70 and 170 once each per level). */
  fruitTriggered: { first: boolean; second: boolean };
  /** Latest ticks-until-flash for the level-clear animation. */
  flashTicks: number;
  /** True iff Elroy 1 active for Blinky on the current level. */
  elroy: 0 | 1 | 2;
}

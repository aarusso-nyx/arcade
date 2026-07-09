/**
 * Perf-budget test for Pac-Man.
 *
 * Asserts one engine tick + a full render at level 5 with all four ghosts
 * out of the house and active (chase / scatter / frightened mixed)
 * completes under 2.0 ms mean. See docs/work/tier-3/perf-budget-tests.md.
 *
 * Pac-Man is the heaviest of the three ticking games: four ghosts each
 * compute a target tile, run the direction-choice rule (up-tie-break),
 * and consult the maze cache; the renderer draws pellets + ghosts +
 * Pac-Man + HUD every frame. Budget reflects that.
 *
 * We use the pre-built MazeCache so the wall-shape construction cost
 * (a one-time hit at game start) isn't billed to per-frame. The mount is
 * bypassed — we draw into a detached `<canvas>` directly.
 */
import { mulberry32, type Direction } from '../../../core';
import { bench, formatBenchResult } from '../../../core/perf/bench';
import { CANVAS_H, CANVAS_W, TILE_SIZE } from './config';
import { parseMaze } from './maze';
import { buildMazeCache, render } from './renderer';
import {
  buildPelletGrid,
  createGhost,
  createInitialGameState,
  createPacman,
  tickWorld,
  type World,
} from './state';
import type { GhostState } from './types';

const BUDGET_MS = 2.0;

function makeContext(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable for perf test');
  return ctx;
}

/**
 * Build a level-5 world with all four ghosts active on the board:
 *  - Blinky: chase (already outside at spawn).
 *  - Pinky:  chase, placed above the ghost-house on the corridor.
 *  - Inky:   scatter, placed in the left-center corridor.
 *  - Clyde:  frightened, placed on the right, exercising the RNG-choice branch.
 * All spawns are tile-centered so the first direction decision happens
 * every iteration (the heavy branch we want to measure).
 */
interface GhostSnapshot {
  x: number;
  y: number;
  direction: Direction;
  state: GhostState;
}

function seedWorld(): { world: World; ghostSeeds: GhostSnapshot[] } {
  const maze = parseMaze();
  const pelletGrid = buildPelletGrid(maze);
  const game = createInitialGameState(maze, 0);
  game.level = 5; // heaviest speed table (see config.LEVEL_5_20).
  game.phase = 'playing';
  game.phaseTimer = 0;
  game.scheduleIndex = 1; // start in chase, matches level-5 schedule after warmup.
  game.frightenedTimer = 60; // keep frightened branch active.
  const pacman = createPacman();
  const ghosts = [
    createGhost('blinky'),
    createGhost('pinky'),
    createGhost('inky'),
    createGhost('clyde'),
  ];

  // Position ghosts just inside a tile boundary along their axis of motion
  // (moving 'left' from x = tx*TILE_SIZE + 0.5 → x < tx*TILE_SIZE after one
  // tick's speed step). That way `moveGhostInMaze` crosses a tile every
  // iteration and the direction-choice hot path (`chooseGhostDirection`)
  // runs every tick — which is the branch this budget is meant to cover.
  const boundaryX = (tx: number): number => tx * TILE_SIZE + 0.5;
  const centerY = (ty: number): number => ty * TILE_SIZE + TILE_SIZE / 2;

  // Place ghosts on walkable tiles, out of the house. Positions chosen from
  // the canonical maze layout: rows 5, 8, 20 all have long open corridors.
  const layout: Array<{ id: 0 | 1 | 2 | 3; tx: number; ty: number; state: GhostState }> = [
    { id: 0, tx: 13, ty: 5, state: 'chase' }, // blinky
    { id: 1, tx: 14, ty: 5, state: 'chase' }, // pinky
    { id: 2, tx: 6, ty: 8, state: 'scatter' }, // inky
    { id: 3, tx: 21, ty: 8, state: 'frightened' }, // clyde
  ];
  const ghostSeeds: GhostSnapshot[] = [];
  for (const l of layout) {
    const g = ghosts[l.id];
    g.position = { x: boundaryX(l.tx), y: centerY(l.ty) };
    g.state = l.state;
    g.hasLeftHouse = true;
    g.direction = 'left';
    g.nextDirection = null;
    ghostSeeds.push({ x: g.position.x, y: g.position.y, direction: 'left', state: l.state });
  }
  const rng = mulberry32(0xacab);
  const world: World = { maze, pelletGrid, game, pacman, ghosts, rng };
  return { world, ghostSeeds };
}

describe('pacman perf budget', () => {
  it(`one tick + render ≤ ${BUDGET_MS} ms mean (level 5, four ghosts active)`, () => {
    const { world, ghostSeeds } = seedWorld();
    const cache = buildMazeCache(world.maze);
    const ctx = makeContext(CANVAS_W, CANVAS_H);
    const pacHome = { x: world.pacman.position.x, y: world.pacman.position.y };
    const pacDir = world.pacman.direction;

    const runOnce = (): void => {
      // Rewind entity positions/directions/states each iteration so we
      // measure a consistent "one tick of the engine at this
      // configuration", not a slowly drifting series. The rewind is a
      // handful of primitive assignments — well under 1 microsecond.
      world.pacman.position = { x: pacHome.x, y: pacHome.y };
      world.pacman.direction = pacDir;
      world.pacman.nextDirection = null;
      world.pacman.animFrame = 0;
      for (let i = 0; i < world.ghosts.length; i++) {
        const g = world.ghosts[i];
        const seed = ghostSeeds[i];
        g.position = { x: seed.x, y: seed.y };
        g.direction = seed.direction;
        g.state = seed.state;
        g.nextDirection = null;
        g.animFrame = 0;
      }
      // Keep frightened alive so the frightened-decision branch (RNG pick)
      // stays exercised across the whole benchmark.
      if (world.game.frightenedTimer < 30) world.game.frightenedTimer = 60;
      tickWorld(world);
      render(ctx, world, cache, 0, false);
    };

    const result = bench(runOnce, { budgetMs: BUDGET_MS, iterations: 200, warmup: 20 });
    // eslint-disable-next-line no-console
    console.log('[perf] pacman', formatBenchResult(result));
    expect(result.meanMs).withContext(formatBenchResult(result)).toBeLessThan(BUDGET_MS);
  });
});

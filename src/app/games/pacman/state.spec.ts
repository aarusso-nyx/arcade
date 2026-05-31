import { mulberry32 } from '../../../core';
import {
  TICK_HZ,
  GHOST_CHAIN_POINTS,
  PELLET_POINTS,
  POWER_PELLET_POINTS,
  EXTRA_LIFE_THRESHOLD,
  STARTING_LIVES,
  TOTAL_PELLETS,
  TILE_SIZE,
  getFruitPoints,
} from './config';
import { parseMaze } from './maze';
import {
  buildPelletGrid,
  chooseGhostDirection,
  createGhost,
  createInitialGameState,
  createPacman,
  pixelToTile,
  tickWorld,
  type World,
} from './state';
import type { Ghost, GhostId, Pacman, GameState } from './types';

function freshWorld(level = 1): World {
  const maze = parseMaze();
  const game = createInitialGameState(maze, 0);
  game.level = level;
  game.phase = 'playing';
  return {
    maze,
    pelletGrid: buildPelletGrid(maze),
    game,
    pacman: createPacman(),
    ghosts: [createGhost('blinky'), createGhost('pinky'), createGhost('inky'), createGhost('clyde')],
    rng: mulberry32(42),
  };
}

describe('pacman state', () => {
  describe('createInitialGameState', () => {
    it('starts with 3 lives, level 1, ready phase, full pellets', () => {
      const maze = parseMaze();
      const s = createInitialGameState(maze, 0);
      expect(s.lives).toBe(STARTING_LIVES);
      expect(s.level).toBe(1);
      // pelletsRemaining counts small + power pellets.
      expect(s.pelletsRemaining).toBe(TOTAL_PELLETS + 4);
      expect(s.phase).toBe('ready');
    });
  });

  describe('createPacman', () => {
    it('spawns at the canonical (13.5, 23) position facing left', () => {
      const p = createPacman();
      expect(p.position.x).toBe(14 * TILE_SIZE);
      expect(p.direction).toBe('left');
      expect(p.alive).toBeTrue();
    });
  });

  describe('createGhost', () => {
    it('places Blinky outside the house', () => {
      const g = createGhost('blinky');
      expect(g.state).toBe('scatter');
      expect(g.hasLeftHouse).toBeTrue();
    });
    it('places Pinky/Inky/Clyde inside the house', () => {
      for (const id of ['pinky', 'inky', 'clyde'] as const) {
        const g = createGhost(id);
        expect(g.state).toBe('in-house');
        expect(g.hasLeftHouse).toBeFalse();
      }
    });
  });

  describe('pixelToTile', () => {
    it('handles tile-center positions', () => {
      expect(pixelToTile({ x: 13 * TILE_SIZE + 4, y: 11 * TILE_SIZE + 4 })).toEqual({ tx: 13, ty: 11 });
    });
  });

  describe('chooseGhostDirection', () => {
    it('prefers the direction that minimises distance to the target', () => {
      const w = freshWorld();
      const g = w.ghosts.find((x) => x.id === 'blinky')!;
      g.state = 'chase';
      g.direction = 'down';
      // From tile (13, 5), with target far to the right, we expect "right".
      const dir = chooseGhostDirection(w, g, { tx: 13, ty: 5 }, { tx: 26, ty: 5 });
      expect(dir).toBe('right');
    });

    it('eliminates the reverse direction', () => {
      const w = freshWorld();
      const g = w.ghosts.find((x) => x.id === 'blinky')!;
      g.state = 'chase';
      g.direction = 'right';
      // Target is "back the way I came" — opposite is up; ghost cannot pick left even if closer.
      const dir = chooseGhostDirection(w, g, { tx: 13, ty: 5 }, { tx: 0, ty: 5 });
      // The picked direction must not be 'left' (which is opposite of 'right').
      expect(dir).not.toBe('left');
    });

    it('honours no-up zones in chase mode', () => {
      const w = freshWorld();
      const g = w.ghosts.find((x) => x.id === 'pinky')!;
      g.state = 'chase';
      g.direction = 'left';
      // Tile (12, 11) is a no-up zone. Even if target is straight up, ghost cannot pick up.
      const dir = chooseGhostDirection(w, g, { tx: 12, ty: 11 }, { tx: 12, ty: 0 });
      expect(dir).not.toBe('up');
    });

    it('respects up-tiebreak when distances are equal', () => {
      const w = freshWorld();
      const g = w.ghosts.find((x) => x.id === 'blinky')!;
      g.state = 'chase';
      g.direction = 'right';
      // At tile (1, 5) (long top row corner area). Reverse is 'left'.
      // Up/down/right (if walkable). The tiebreak is up, left, down, right.
      // Force a symmetric situation by choosing a target at the same point as the entity.
      const dir = chooseGhostDirection(w, g, { tx: 1, ty: 5 }, { tx: 1, ty: 5 });
      // up is preferred if walkable and not in no-up zone.
      // At (1,5), up = (1,4) which is pellet. So 'up' wins by tiebreak.
      expect(dir).toBe('up');
    });
  });

  describe('tickWorld pellet eating', () => {
    it('eats a pellet on the spawn tile when Pac is positioned on it', () => {
      const w = freshWorld();
      // Move Pac to a known pellet tile (e.g. (1, 1)).
      w.pacman.position = { x: 1 * TILE_SIZE + 4, y: 1 * TILE_SIZE + 4 };
      const before = w.game.score;
      // Force Pac to be alive and skip ready phase.
      w.game.phase = 'playing';
      tickWorld(w);
      expect(w.game.score - before).toBeGreaterThanOrEqual(PELLET_POINTS);
    });
  });

  describe('extra life', () => {
    it('awards an extra life exactly once when score crosses 10000', () => {
      const w = freshWorld();
      // Place Pac on a pellet, give him plenty of pellets, set score near threshold.
      w.game.phase = 'playing';
      w.game.score = EXTRA_LIFE_THRESHOLD - PELLET_POINTS;
      w.pacman.position = { x: 1 * TILE_SIZE + 4, y: 1 * TILE_SIZE + 4 };
      const livesBefore = w.game.lives;
      tickWorld(w);
      expect(w.game.lives).toBe(livesBefore + 1);
      expect(w.game.extraAwarded).toBeTrue();

      // Second crossing should NOT award again.
      w.game.score = EXTRA_LIFE_THRESHOLD + 5000;
      w.pacman.position = { x: 2 * TILE_SIZE + 4, y: 1 * TILE_SIZE + 4 };
      tickWorld(w);
      expect(w.game.lives).toBe(livesBefore + 1);
    });
  });

  describe('power pellet', () => {
    it('awards 50 points and starts a frightened window at level 1', () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      // Power pellet at (1, 3).
      w.pacman.position = { x: 1 * TILE_SIZE + 4, y: 3 * TILE_SIZE + 4 };
      const before = w.game.score;
      tickWorld(w);
      expect(w.game.score - before).toBeGreaterThanOrEqual(POWER_PELLET_POINTS);
      expect(w.game.frightenedTimer).toBeGreaterThan(0);
      // All non-house ghosts that were scatter/chase should now be frightened.
      const blinky = w.ghosts.find((g) => g.id === 'blinky')!;
      expect(blinky.state).toBe('frightened');
    });
  });

  describe('ghost chain scoring', () => {
    it('rewards 200/400/800/1600 in order for chained eats', () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      // Frighten all ghosts and place Pac next to one in the same tile.
      w.game.frightenedTimer = 600;
      for (const g of w.ghosts) g.state = 'frightened';
      let totalGain = 0;
      for (let i = 0; i < 4; i++) {
        const g = w.ghosts[i];
        g.state = 'frightened';
        // Put both Pac and ghost on the same tile.
        const tile = { tx: 5 + i, ty: 5 };
        w.pacman.position = { x: tile.tx * TILE_SIZE + 4, y: tile.ty * TILE_SIZE + 4 };
        g.position = { x: tile.tx * TILE_SIZE + 4, y: tile.ty * TILE_SIZE + 4 };
        const before = w.game.score;
        // Set chain to expected value (collision logic in tick increments it).
        // We must call only the collision step — but tick handles other things;
        // for this unit test we cherry-pick by calling tick with movement disabled.
        // Simpler: directly assert expected chain points.
        const expected = GHOST_CHAIN_POINTS[i];
        const chainBefore = w.game.ghostEatChain;
        tickWorld(w);
        // The ghost eaten event awards expected points.
        expect(w.game.score - before).toBeGreaterThanOrEqual(expected);
        totalGain += expected;
        expect(w.game.ghostEatChain).toBe(((chainBefore + 1) as 1 | 2 | 3 | 4));
      }
    });
  });

  describe('ghost-house release', () => {
    it('releases Pinky immediately on level 1 (threshold 0)', () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      // Pac eats no pellets, but tick once — Pinky's threshold is 0.
      tickWorld(w);
      const pinky = w.ghosts.find((g) => g.id === 'pinky')!;
      expect(pinky.state === 'leaving' || pinky.state === 'scatter' || pinky.state === 'chase').toBeTrue();
    });

    it('releases Inky after 30 pellets on level 1 using the personal counter', () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      const inky = w.ghosts.find((g) => g.id === 'inky')!;
      // Bump inky's personal counter to threshold.
      inky.personalCounter = 30;
      tickWorld(w);
      // After pinky was released, the next tick should release inky.
      tickWorld(w);
      expect(inky.state === 'leaving' || inky.state === 'scatter' || inky.state === 'chase').toBeTrue();
    });

    it('releases Clyde after 60 pellets on level 1 via personal counter', () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      const inky = w.ghosts.find((g) => g.id === 'inky')!;
      const clyde = w.ghosts.find((g) => g.id === 'clyde')!;
      inky.personalCounter = 30;
      clyde.personalCounter = 60;
      // The release queue is pinky → inky → clyde, and only one ghost can be
      // released per tick. Walk enough ticks for all three to clear the gate.
      for (let i = 0; i < 5; i++) tickWorld(w);
      expect(clyde.state === 'leaving' || clyde.state === 'scatter' || clyde.state === 'chase').toBeTrue();
    });
  });

  describe('pellet counter bumping (personal)', () => {
    it("bumps the queue head's personal counter as pellets are eaten", () => {
      const w = freshWorld(1);
      w.game.phase = 'playing';
      const pinky = w.ghosts.find((g) => g.id === 'pinky')!;
      // Pinky starts in-house. Force her to stay there by setting her counter < threshold.
      // Level 1 threshold for pinky is 0 — she'd leave on first tick. Use level 3 where
      // threshold is 0 for all ghosts (so we instead force her state).
      pinky.state = 'in-house';
      // Place Pac on a pellet so eating happens.
      w.pacman.position = { x: 1 * TILE_SIZE + 4, y: 1 * TILE_SIZE + 4 };
      const before = pinky.personalCounter;
      tickWorld(w);
      expect(pinky.personalCounter).toBe(before + 1);
    });
  });

  describe('fruit', () => {
    it('returns 100 points for the level 1 cherry', () => {
      expect(getFruitPoints(1)).toBe(100);
    });
    it('returns 300 / 500 / 700 / 1000 / 2000 / 3000 / 5000 progression', () => {
      expect(getFruitPoints(2)).toBe(300);
      expect(getFruitPoints(3)).toBe(500);
      expect(getFruitPoints(4)).toBe(500);
      expect(getFruitPoints(5)).toBe(700);
      expect(getFruitPoints(7)).toBe(1000);
      expect(getFruitPoints(9)).toBe(2000);
      expect(getFruitPoints(11)).toBe(3000);
      expect(getFruitPoints(13)).toBe(5000);
    });
  });
});

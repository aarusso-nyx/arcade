import { mulberry32 } from '../../../core';
import { DEFAULT_CONFIG, SnakeConfig, tickIntervalFor, SCORE } from './config';
import { createInitialState, step } from './state';

const cfg = (overrides: Partial<SnakeConfig> = {}): SnakeConfig => ({
  ...DEFAULT_CONFIG,
  cols: 10,
  rows: 10,
  initialLength: 3,
  ...overrides,
});

describe('snake state', () => {
  describe('createInitialState', () => {
    it('places the snake horizontally centred, facing right', () => {
      const s = createInitialState(cfg(), mulberry32(1));
      expect(s.direction).toBe('right');
      expect(s.body.length).toBe(3);
      expect(s.body[0].col).toBe(5);
      // Head at col 5, tail at col 3 (initialLength-1 cells to the left).
      expect(s.body[2].col).toBe(3);
      expect(s.status).toBe('idle');
    });

    it('spawns initial food on an empty cell', () => {
      const s = createInitialState(cfg(), mulberry32(1));
      expect(s.food).not.toBeNull();
      const occ = s.body.some(
        (b) => b.col === s.food!.col && b.row === s.food!.row,
      );
      expect(occ).toBeFalse();
    });
  });

  describe('step', () => {
    const playing = () => {
      const s = createInitialState(cfg(), mulberry32(1));
      s.status = 'playing';
      return s;
    };

    it('advances one cell per tick in the current direction', () => {
      const s = playing();
      const headBefore = { ...s.body[0] };
      step(s, undefined, 0, mulberry32(2), cfg());
      expect(s.body[0]).toEqual({ col: headBefore.col + 1, row: headBefore.row });
    });

    it('preserves length without food', () => {
      const s = playing();
      // Force food out of the way so it isn't eaten.
      s.food = { col: 0, row: 0 };
      const lengthBefore = s.body.length;
      step(s, undefined, 0, mulberry32(2), cfg());
      expect(s.body.length).toBe(lengthBefore);
    });

    it('grows by one when eating food, awards food points, respawns food', () => {
      const s = playing();
      // Plant food directly in front of the head.
      const head = s.body[0];
      s.food = { col: head.col + 1, row: head.row };
      const lengthBefore = s.body.length;
      const events = step(s, undefined, 0, mulberry32(2), cfg());
      expect(events.ateFood).toBeTrue();
      expect(events.scoreDelta).toBe(SCORE.food);
      expect(s.score).toBe(SCORE.food);
      expect(s.foodsEaten).toBe(1);
      expect(s.body.length).toBe(lengthBefore + 1);
      expect(s.food).not.toBeNull();
    });

    it('dies on wall in classic mode', () => {
      const s = playing();
      // Drive the head to the right wall.
      while (s.body[0].col < cfg().cols - 1 && s.status === 'playing') {
        s.food = { col: 0, row: 0 };
        step(s, undefined, 0, mulberry32(3), cfg());
      }
      // One more step should die.
      const events = step(s, undefined, 0, mulberry32(3), cfg());
      expect(events.died).toBe('wall');
      expect(s.status).toBe('gameover');
    });

    it('wraps in wrap mode', () => {
      const c = cfg({ mode: 'wrap' });
      const s = createInitialState(c, mulberry32(1));
      s.status = 'playing';
      while (s.body[0].col < c.cols - 1 && s.status === 'playing') {
        s.food = { col: 0, row: 0 };
        step(s, undefined, 0, mulberry32(3), c);
      }
      // At col = cols-1, next tick should wrap to col 0.
      s.food = { col: 5, row: 5 };
      step(s, undefined, 0, mulberry32(3), c);
      expect(s.status).toBe('playing');
      expect(s.body[0].col).toBe(0);
    });

    it('dies when the head enters the tile the tail just vacated (spec §6)', () => {
      // Build a snake that is curled so its next step lands on the current tail.
      // Start: snake going right, length 4 at row 5: cols 5,4,3,2 (head→tail).
      // Turn down, then left, then up — the snake forms a U and the head
      // returns to the column the tail will vacate. The spec says: death.
      const c = cfg({ initialLength: 4 });
      const s = createInitialState(c, mulberry32(1));
      s.status = 'playing';
      s.food = { col: 0, row: 0 };
      // Move right one to settle the layout.
      step(s, undefined, 0, mulberry32(3), c);
      // Turn down.
      step(s, 'down', 0, mulberry32(3), c);
      // Turn left.
      step(s, 'left', 0, mulberry32(3), c);
      // Turn up — head moves into the tile the tail is vacating.
      const ev = step(s, 'up', 0, mulberry32(3), c);
      expect(ev.died).toBe('self');
      expect(s.status).toBe('gameover');
    });

    it('rejects nothing about returning the same direction (no reversal)', () => {
      const s = playing();
      s.food = { col: 0, row: 0 };
      step(s, 'right', 0, mulberry32(2), cfg());
      expect(s.status).toBe('playing');
    });

    it('awards a length bonus when crossing every 10 segments', () => {
      // initialLength 9 → after one growth tick, length becomes 10.
      const c = cfg({ initialLength: 9 });
      const s = createInitialState(c, mulberry32(1));
      s.status = 'playing';
      const head = s.body[0];
      s.food = { col: head.col + 1, row: head.row };
      const ev = step(s, undefined, 0, mulberry32(2), c);
      expect(s.body.length).toBe(10);
      expect(ev.scoreDelta).toBe(SCORE.food + SCORE.lengthBonus);
    });
  });
});

describe('tickIntervalFor', () => {
  const c = cfg();
  it('starts at startTickMs with zero foods', () => expect(tickIntervalFor(0, c)).toBe(200));
  it('decrements once every foodsPerStep foods', () => {
    expect(tickIntervalFor(4, c)).toBe(200);
    expect(tickIntervalFor(5, c)).toBe(190);
    expect(tickIntervalFor(10, c)).toBe(180);
  });
  it('clamps at minTickMs', () => {
    expect(tickIntervalFor(1000, c)).toBe(60);
  });
});

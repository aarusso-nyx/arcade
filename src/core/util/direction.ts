export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'] as const;

export interface Delta {
  readonly dx: number;
  readonly dy: number;
}

export const DELTA: Readonly<Record<Direction, Delta>> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export const isOpposite = (a: Direction, b: Direction): boolean => OPPOSITE[a] === b;

export const rotateCW: Readonly<Record<Direction, Direction>> = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
};

export const rotateCCW: Readonly<Record<Direction, Direction>> = {
  up: 'left',
  left: 'down',
  down: 'right',
  right: 'up',
};

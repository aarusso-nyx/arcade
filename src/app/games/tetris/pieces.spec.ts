import { pieceCells, SHAPES, SPAWN_POS } from './pieces';
import type { PieceType, Rotation } from './types';

describe('tetris/pieces', () => {
  it('every piece has exactly 4 rotation states with 4 cells each', () => {
    const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (const p of pieces) {
      expect(SHAPES[p].length).toBe(4);
      for (const r of [0, 1, 2, 3]) {
        expect(SHAPES[p][r].length).toBe(4);
      }
    }
  });

  it('I piece state 0 horizontal across (0..3, 1)', () => {
    const cells = SHAPES.I[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,1', '1,1', '2,1', '3,1']);
  });

  it('I piece state R vertical at column 2', () => {
    const cells = SHAPES.I[1].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['2,0', '2,1', '2,2', '2,3']);
  });

  it('I piece state 2 horizontal across (0..3, 2)', () => {
    const cells = SHAPES.I[2].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,2', '1,2', '2,2', '3,2']);
  });

  it('I piece state L vertical at column 1', () => {
    const cells = SHAPES.I[3].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['1,0', '1,1', '1,2', '1,3']);
  });

  it('O piece is identical across all rotations', () => {
    const s0 = JSON.stringify(SHAPES.O[0]);
    for (const r of [1, 2, 3] as Rotation[]) {
      expect(JSON.stringify(SHAPES.O[r])).toBe(s0);
    }
  });

  it('T piece state 0 has the bump on top', () => {
    const cells = SHAPES.T[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,1', '1,0', '1,1', '2,1']);
  });

  it('T piece state 2 has the bump on bottom', () => {
    const cells = SHAPES.T[2].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,1', '1,1', '1,2', '2,1']);
  });

  it('S piece state 0 matches spec', () => {
    const cells = SHAPES.S[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,1', '1,0', '1,1', '2,0']);
  });

  it('Z piece state 0 matches spec', () => {
    const cells = SHAPES.Z[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,0', '1,0', '1,1', '2,1']);
  });

  it('J piece state 0 matches spec', () => {
    const cells = SHAPES.J[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,0', '0,1', '1,1', '2,1']);
  });

  it('L piece state 0 matches spec', () => {
    const cells = SHAPES.L[0].map(([x, y]) => `${x},${y}`).sort();
    expect(cells).toEqual(['0,1', '1,1', '2,0', '2,1']);
  });

  it('all pieces have a defined spawn position', () => {
    const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (const p of pieces) expect(SPAWN_POS[p]).toBeDefined();
  });

  it('pieceCells translates by (x, y)', () => {
    const cells = pieceCells('T', 0, 3, 19);
    const sorted = cells.map(([x, y]) => `${x},${y}`).sort();
    expect(sorted).toEqual(['3,20', '4,19', '4,20', '5,20']);
  });
});

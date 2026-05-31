import { allCellsInBuffer, clearRows, collides, createEmptyGrid, detectFullRows, dropY, lockPiece } from './board';
import { COLS, TOTAL_ROWS } from './config';
import { makeActive } from './state';
import type { ActivePiece } from './types';

describe('tetris/board', () => {
  it('creates an empty 40x10 grid of zeros', () => {
    const g = createEmptyGrid();
    expect(g.length).toBe(TOTAL_ROWS);
    expect(g[0].length).toBe(COLS);
    for (let y = 0; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        expect(g[y][x]).toBe(0);
      }
    }
  });

  it('collides with left wall', () => {
    const g = createEmptyGrid();
    const t: ActivePiece = { ...makeActive('T'), x: -1 };
    expect(collides(t, g)).toBe(true);
  });

  it('collides with right wall', () => {
    const g = createEmptyGrid();
    const t: ActivePiece = { ...makeActive('T'), x: 9 };
    expect(collides(t, g)).toBe(true);
  });

  it('collides with floor', () => {
    const g = createEmptyGrid();
    const t: ActivePiece = { ...makeActive('T'), y: TOTAL_ROWS - 1 };
    expect(collides(t, g)).toBe(true);
  });

  it('collides with locked cells', () => {
    const g = createEmptyGrid();
    g[20][4] = 'I';
    // T at spawn (3,19) places blocks at (4,20),(5,20)... overlaps.
    const t = makeActive('T');
    expect(collides(t, g)).toBe(true);
  });

  it('does not collide on empty centre', () => {
    const g = createEmptyGrid();
    const t = makeActive('T');
    expect(collides(t, g)).toBe(false);
  });

  it('detects no full rows on empty grid', () => {
    const g = createEmptyGrid();
    expect(detectFullRows(g)).toEqual([]);
  });

  it('detects one full row at the bottom', () => {
    const g = createEmptyGrid();
    for (let x = 0; x < COLS; x++) g[TOTAL_ROWS - 1][x] = 'I';
    expect(detectFullRows(g)).toEqual([TOTAL_ROWS - 1]);
  });

  it('detects 4 full rows (Tetris) at the bottom', () => {
    const g = createEmptyGrid();
    for (let y = TOTAL_ROWS - 4; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) g[y][x] = 'I';
    }
    expect(detectFullRows(g)).toEqual([36, 37, 38, 39]);
  });

  it('clearRows removes the indicated rows and prepends empty rows', () => {
    const g = createEmptyGrid();
    // Fill bottom row
    for (let x = 0; x < COLS; x++) g[39][x] = 'I';
    // Put a marker above
    g[38][0] = 'T';
    const next = clearRows(g, [39]);
    expect(next.length).toBe(TOTAL_ROWS);
    // The marker should have moved down by one row to row 39 only? No — clearRows removes the row and prepends empties; rows below the cleared row don't exist. The 'T' at y=38 should now be at y=39.
    expect(next[39][0]).toBe('T');
    expect(next[0].every((c) => c === 0)).toBe(true);
  });

  it('clearRows on no rows returns the grid unchanged', () => {
    const g = createEmptyGrid();
    g[20][0] = 'I';
    const out = clearRows(g, []);
    expect(out).toBe(g);
  });

  it('lockPiece writes the piece type into the grid', () => {
    const g = createEmptyGrid();
    const t = makeActive('T');
    lockPiece(t, g);
    let count = 0;
    for (let y = 0; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (g[y][x] === 'T') count++;
    }
    expect(count).toBe(4);
  });

  it('allCellsInBuffer is true when piece is fully above visible playfield', () => {
    const t: ActivePiece = { ...makeActive('T'), y: 17 }; // 3x3 box at y=17..19, all < 20
    expect(allCellsInBuffer(t)).toBe(true);
  });

  it('allCellsInBuffer is false when any cell crosses into visible playfield', () => {
    const t: ActivePiece = { ...makeActive('T'), y: 19 }; // box at y=19..21, includes y=20
    expect(allCellsInBuffer(t)).toBe(false);
  });

  it('dropY drops piece to the floor on empty board', () => {
    const g = createEmptyGrid();
    const t = makeActive('T');
    const y = dropY(t, g);
    // T state 0 cells include max y offset 1 → bottom row = y + 1.
    // Floor at y=39 → y+1 = 39 → y = 38.
    expect(y).toBe(38);
  });

  it('dropY stops above an obstacle', () => {
    const g = createEmptyGrid();
    for (let x = 0; x < COLS; x++) g[30][x] = 'I';
    const t = makeActive('T');
    const y = dropY(t, g);
    // Bottom cell row at y+1 must be < 30 → y+1 = 29 → y = 28.
    expect(y).toBe(28);
  });
});


import { BUFFER_ROWS, COLS, TOTAL_ROWS } from './config';
import { pieceCells } from './pieces';
import type { ActivePiece, Cell, Grid } from './types';

export function createEmptyGrid(): Grid {
  const g: Grid = new Array(TOTAL_ROWS);
  for (let y = 0; y < TOTAL_ROWS; y++) {
    g[y] = new Array(COLS).fill(0) as Cell[];
  }
  return g;
}

export function cloneGrid(g: Grid): Grid {
  const out: Grid = new Array(g.length);
  for (let y = 0; y < g.length; y++) out[y] = g[y].slice();
  return out;
}

/** True if any of the given cells is out-of-bounds or overlaps a non-empty grid cell. */
export function collides(piece: ActivePiece, grid: Grid): boolean {
  const cells = pieceCells(piece.type, piece.rotation, piece.x, piece.y);
  for (const [x, y] of cells) {
    if (x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS) return true;
    if (grid[y][x] !== 0) return true;
  }
  return false;
}

/** Write the piece's cells into the grid (mutates). */
export function lockPiece(piece: ActivePiece, grid: Grid): void {
  const cells = pieceCells(piece.type, piece.rotation, piece.x, piece.y);
  for (const [x, y] of cells) {
    if (y >= 0 && y < TOTAL_ROWS && x >= 0 && x < COLS) {
      grid[y][x] = piece.type;
    }
  }
}

/** Returns the indices of rows in the grid that are completely full. */
export function detectFullRows(grid: Grid, rowsToCheck?: ReadonlyArray<number>): number[] {
  const rows = rowsToCheck ?? rangeAll();
  const full: number[] = [];
  for (const y of rows) {
    if (y < 0 || y >= TOTAL_ROWS) continue;
    let isFull = true;
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === 0) {
        isFull = false;
        break;
      }
    }
    if (isFull) full.push(y);
  }
  full.sort((a, b) => a - b);
  return full;
}

function rangeAll(): number[] {
  const r: number[] = [];
  for (let y = 0; y < TOTAL_ROWS; y++) r.push(y);
  return r;
}

/** Remove the given rows and prepend equally many empty rows; returns a new grid. */
export function clearRows(grid: Grid, rows: ReadonlyArray<number>): Grid {
  if (rows.length === 0) return grid;
  const drop = new Set(rows);
  const remaining: Grid = [];
  for (let y = 0; y < grid.length; y++) {
    if (!drop.has(y)) remaining.push(grid[y]);
  }
  const out: Grid = [];
  for (let i = 0; i < rows.length; i++) out.push(new Array(COLS).fill(0) as Cell[]);
  for (const r of remaining) out.push(r);
  return out;
}

/** True iff all cells of the piece lie in the buffer (y < bufferRows). */
export function allCellsInBuffer(piece: ActivePiece): boolean {
  const cells = pieceCells(piece.type, piece.rotation, piece.x, piece.y);
  for (const [, y] of cells) {
    if (y >= BUFFER_ROWS) return false;
  }
  return true;
}

/** True if any cell is in the buffer (used for optional partial lock-out). */
export function anyCellInBuffer(piece: ActivePiece): boolean {
  const cells = pieceCells(piece.type, piece.rotation, piece.x, piece.y);
  for (const [, y] of cells) {
    if (y < BUFFER_ROWS) return true;
  }
  return false;
}

/** Compute the resting Y for hard-drop / ghost. */
export function dropY(piece: ActivePiece, grid: Grid): number {
  let y = piece.y;
  while (true) {
    const cells = pieceCells(piece.type, piece.rotation, piece.x, y + 1);
    let blocked = false;
    for (const [cx, cy] of cells) {
      if (cy >= TOTAL_ROWS) { blocked = true; break; }
      if (cx < 0 || cx >= COLS) { blocked = true; break; }
      if (grid[cy][cx] !== 0) { blocked = true; break; }
    }
    if (blocked) return y;
    y++;
  }
}

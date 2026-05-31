export interface GridSize {
  readonly cols: number;
  readonly rows: number;
}

export interface GridConfig extends GridSize {
  readonly tileSize: number;
}

export const tileToPixel = (tile: number, tileSize: number): number => tile * tileSize;

export const pixelToTile = (px: number, tileSize: number): number => Math.floor(px / tileSize);

export const tileCenterPx = (tile: number, tileSize: number): number =>
  tile * tileSize + tileSize / 2;

export const inBounds = (col: number, row: number, size: GridSize): boolean =>
  col >= 0 && col < size.cols && row >= 0 && row < size.rows;

export const tileIndex = (col: number, row: number, size: GridSize): number =>
  row * size.cols + col;

export const indexToTile = (index: number, size: GridSize): { col: number; row: number } => ({
  col: index % size.cols,
  row: Math.floor(index / size.cols),
});

export const wrapCol = (col: number, size: GridSize): number =>
  ((col % size.cols) + size.cols) % size.cols;

export const wrapRow = (row: number, size: GridSize): number =>
  ((row % size.rows) + size.rows) % size.rows;

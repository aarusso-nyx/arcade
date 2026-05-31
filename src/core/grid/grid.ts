export interface GridConfig {
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
}

export const tileToPixel = (tile: number, tileSize: number): number => tile * tileSize;

export const pixelToTile = (px: number, tileSize: number): number => Math.floor(px / tileSize);

export const tileCenterPx = (tile: number, tileSize: number): number =>
  tile * tileSize + tileSize / 2;

export const inBounds = (col: number, row: number, cfg: GridConfig): boolean =>
  col >= 0 && col < cfg.cols && row >= 0 && row < cfg.rows;

export const tileIndex = (col: number, row: number, cfg: GridConfig): number =>
  row * cfg.cols + col;

export const indexToTile = (index: number, cfg: GridConfig): { col: number; row: number } => ({
  col: index % cfg.cols,
  row: Math.floor(index / cfg.cols),
});

export const wrapCol = (col: number, cfg: GridConfig): number =>
  ((col % cfg.cols) + cfg.cols) % cfg.cols;

export const wrapRow = (row: number, cfg: GridConfig): number =>
  ((row % cfg.rows) + cfg.rows) % cfg.rows;

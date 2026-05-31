import {
  GridConfig,
  tileToPixel,
  pixelToTile,
  tileCenterPx,
  inBounds,
  tileIndex,
  indexToTile,
  wrapCol,
  wrapRow,
} from './grid';

const cfg: GridConfig = { cols: 28, rows: 36, tileSize: 8 };

describe('grid', () => {
  describe('tile/pixel conversions', () => {
    it('tileToPixel multiplies by tileSize', () => expect(tileToPixel(3, 8)).toBe(24));
    it('pixelToTile floors', () => {
      expect(pixelToTile(0, 8)).toBe(0);
      expect(pixelToTile(7, 8)).toBe(0);
      expect(pixelToTile(8, 8)).toBe(1);
      expect(pixelToTile(15, 8)).toBe(1);
    });
    it('tileCenterPx returns the centre of the tile', () => expect(tileCenterPx(2, 8)).toBe(20));
  });

  describe('inBounds', () => {
    it('accepts coordinates inside the grid', () => {
      expect(inBounds(0, 0, cfg)).toBeTrue();
      expect(inBounds(27, 35, cfg)).toBeTrue();
    });
    it('rejects coordinates outside the grid', () => {
      expect(inBounds(-1, 0, cfg)).toBeFalse();
      expect(inBounds(0, -1, cfg)).toBeFalse();
      expect(inBounds(28, 0, cfg)).toBeFalse();
      expect(inBounds(0, 36, cfg)).toBeFalse();
    });
  });

  describe('tileIndex / indexToTile', () => {
    it('round-trips for arbitrary cells', () => {
      for (const [col, row] of [
        [0, 0],
        [27, 0],
        [0, 35],
        [13, 17],
        [27, 35],
      ] as const) {
        const idx = tileIndex(col, row, cfg);
        expect(indexToTile(idx, cfg)).toEqual({ col, row });
      }
    });
  });

  describe('wrap', () => {
    it('wraps columns positively and negatively', () => {
      expect(wrapCol(0, cfg)).toBe(0);
      expect(wrapCol(28, cfg)).toBe(0);
      expect(wrapCol(-1, cfg)).toBe(27);
      expect(wrapCol(29, cfg)).toBe(1);
    });
    it('wraps rows positively and negatively', () => {
      expect(wrapRow(0, cfg)).toBe(0);
      expect(wrapRow(36, cfg)).toBe(0);
      expect(wrapRow(-1, cfg)).toBe(35);
    });
  });
});

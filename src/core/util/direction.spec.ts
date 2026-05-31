import { DELTA, OPPOSITE, isOpposite, rotateCW, rotateCCW, DIRECTIONS } from './direction';

describe('direction utils', () => {
  describe('DELTA', () => {
    it('uses screen-space y-down convention', () => {
      expect(DELTA.up).toEqual({ dx: 0, dy: -1 });
      expect(DELTA.down).toEqual({ dx: 0, dy: 1 });
      expect(DELTA.left).toEqual({ dx: -1, dy: 0 });
      expect(DELTA.right).toEqual({ dx: 1, dy: 0 });
    });
  });

  describe('OPPOSITE / isOpposite', () => {
    it('maps each direction to its inverse', () => {
      expect(OPPOSITE.up).toBe('down');
      expect(OPPOSITE.down).toBe('up');
      expect(OPPOSITE.left).toBe('right');
      expect(OPPOSITE.right).toBe('left');
    });
    it('isOpposite is symmetric', () => {
      expect(isOpposite('up', 'down')).toBeTrue();
      expect(isOpposite('down', 'up')).toBeTrue();
      expect(isOpposite('up', 'left')).toBeFalse();
      expect(isOpposite('up', 'up')).toBeFalse();
    });
  });

  describe('rotateCW / rotateCCW are inverses', () => {
    for (const d of DIRECTIONS) {
      it(`rotateCCW(rotateCW(${d})) === ${d}`, () =>
        expect(rotateCCW[rotateCW[d]]).toBe(d));
      it(`rotateCW four times returns ${d}`, () =>
        expect(rotateCW[rotateCW[rotateCW[rotateCW[d]]]]).toBe(d));
    }
  });
});

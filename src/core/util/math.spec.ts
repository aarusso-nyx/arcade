import { clamp, mod, lerp, sign, manhattan, euclideanSq } from './math';

describe('math utils', () => {
  describe('clamp', () => {
    it('clamps below the lower bound', () => expect(clamp(-5, 0, 10)).toBe(0));
    it('clamps above the upper bound', () => expect(clamp(15, 0, 10)).toBe(10));
    it('passes through values in range', () => expect(clamp(5, 0, 10)).toBe(5));
    it('handles bounds equal to value', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('mod (positive modulo)', () => {
    it('matches % for positive operands', () => expect(mod(7, 3)).toBe(1));
    it('wraps negative operands into positive range', () => {
      expect(mod(-1, 3)).toBe(2);
      expect(mod(-4, 3)).toBe(2);
      expect(mod(-7, 5)).toBe(3);
    });
    it('returns 0 for exact multiples', () => {
      expect(mod(0, 5)).toBe(0);
      expect(mod(10, 5)).toBe(0);
      expect(mod(-10, 5)).toBe(0);
    });
  });

  describe('lerp', () => {
    it('returns a at t=0', () => expect(lerp(10, 20, 0)).toBe(10));
    it('returns b at t=1', () => expect(lerp(10, 20, 1)).toBe(20));
    it('interpolates linearly at t=0.5', () => expect(lerp(10, 20, 0.5)).toBe(15));
    it('extrapolates past 1', () => expect(lerp(0, 10, 2)).toBe(20));
  });

  describe('sign', () => {
    it('returns 1 for positive', () => expect(sign(42)).toBe(1));
    it('returns -1 for negative', () => expect(sign(-42)).toBe(-1));
    it('returns 0 for zero', () => expect(sign(0)).toBe(0));
  });

  describe('manhattan', () => {
    it('sums absolute deltas', () => expect(manhattan(0, 0, 3, 4)).toBe(7));
    it('is symmetric', () => expect(manhattan(3, 4, 0, 0)).toBe(7));
    it('is zero for the same point', () => expect(manhattan(5, 5, 5, 5)).toBe(0));
  });

  describe('euclideanSq', () => {
    it('returns squared distance', () => expect(euclideanSq(0, 0, 3, 4)).toBe(25));
    it('is zero for the same point', () => expect(euclideanSq(1, 1, 1, 1)).toBe(0));
  });
});

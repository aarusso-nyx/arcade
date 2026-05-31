import { mulberry32, randInt } from './rng';

describe('mulberry32', () => {
  it('yields values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs across seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const diffs = Array.from({ length: 50 }, () => a() !== b()).filter(Boolean).length;
    expect(diffs).toBeGreaterThan(40);
  });
});

describe('randInt', () => {
  it('returns values in [lo, hi)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const n = randInt(rng, 5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
      expect(Number.isInteger(n)).toBeTrue();
    }
  });
});

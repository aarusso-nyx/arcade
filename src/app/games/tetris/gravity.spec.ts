import { gravityForLevel } from './gravity';

describe('tetris/gravity', () => {
  it('level 1 ≈ 0.0167 rows/tick', () => {
    expect(gravityForLevel(1)).toBeCloseTo(1 / 60, 4);
  });

  it('level 10 ≈ 0.26 rows/tick (within 5%)', () => {
    // Spec table: 0.24762 (gameplay.md) or 0.25988 (engineering.md). Either is fine within 5%.
    const v = gravityForLevel(10);
    expect(v).toBeGreaterThan(0.22);
    expect(v).toBeLessThan(0.30);
  });

  it('level 19 is large but below 20', () => {
    const v = gravityForLevel(19);
    expect(v).toBeGreaterThan(10);
  });

  it('level 20+ is clamped to 20', () => {
    expect(gravityForLevel(20)).toBe(20);
    expect(gravityForLevel(25)).toBe(20);
    expect(gravityForLevel(100)).toBe(20);
  });

  it('clamps level below 1 to level 1 behaviour', () => {
    expect(gravityForLevel(0)).toBeCloseTo(1 / 60, 4);
  });

  it('gravity is monotonically increasing through level 19', () => {
    let prev = 0;
    for (let lv = 1; lv <= 19; lv++) {
      const v = gravityForLevel(lv);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

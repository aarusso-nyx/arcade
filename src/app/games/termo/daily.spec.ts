import {
  LAUNCH_DATE,
  dailyPuzzleNumber,
  dailySolution,
  dailySolutionIndex,
  msUntilNextLocalMidnight,
} from './daily';

describe('daily', () => {
  describe('dailyPuzzleNumber', () => {
    it('returns 1 on launch day', () => {
      expect(dailyPuzzleNumber(LAUNCH_DATE)).toBe(1);
    });

    it('returns 1 for any time of day on launch date', () => {
      const morning = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate(),
        9, 30, 0,
      );
      const night = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate(),
        23, 59, 59,
      );
      expect(dailyPuzzleNumber(morning)).toBe(1);
      expect(dailyPuzzleNumber(night)).toBe(1);
    });

    it('returns 2 the day after launch', () => {
      const d = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 1,
      );
      expect(dailyPuzzleNumber(d)).toBe(2);
    });

    it('returns 366 after 365 days', () => {
      const d = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 365,
      );
      expect(dailyPuzzleNumber(d)).toBe(366);
    });

    it('clamps to 1 for dates before LAUNCH_DATE', () => {
      const before = new Date(
        LAUNCH_DATE.getFullYear() - 1,
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate(),
      );
      expect(dailyPuzzleNumber(before)).toBe(1);
    });
  });

  describe('dailySolutionIndex', () => {
    it('stays within [0, N)', () => {
      for (let day = 0; day < 30; day++) {
        const d = new Date(
          LAUNCH_DATE.getFullYear(),
          LAUNCH_DATE.getMonth(),
          LAUNCH_DATE.getDate() + day,
        );
        const idx = dailySolutionIndex(d, 100);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(100);
      }
    });

    it('produces unique indices for a 1-week window when N >= 7', () => {
      const seen = new Set<number>();
      for (let day = 0; day < 7; day++) {
        const d = new Date(
          LAUNCH_DATE.getFullYear(),
          LAUNCH_DATE.getMonth(),
          LAUNCH_DATE.getDate() + day,
        );
        seen.add(dailySolutionIndex(d, 100));
      }
      expect(seen.size).toBe(7);
    });

    it('wraps around at N days', () => {
      const N = 50;
      const d0 = LAUNCH_DATE;
      const dWrap = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + N,
      );
      expect(dailySolutionIndex(dWrap, N)).toBe(dailySolutionIndex(d0, N));
    });

    it('throws on empty list', () => {
      expect(() => dailySolutionIndex(new Date(), 0)).toThrow();
    });
  });

  describe('dailySolution', () => {
    const words = ['alpha', 'bravo', 'cargo', 'delta', 'echos'];

    it('is deterministic for the same date', () => {
      const d = new Date(2026, 1, 14, 10, 0, 0);
      expect(dailySolution(d, words)).toBe(dailySolution(d, words));
    });

    it('changes when the local date changes', () => {
      const d1 = new Date(2026, 1, 14);
      const d2 = new Date(2026, 1, 15);
      // For our small list, indices differ by 1 mod 5 — guaranteed distinct.
      expect(dailySolution(d1, words)).not.toBe(dailySolution(d2, words));
    });

    it('returns the same word for morning and evening of the same day', () => {
      const morning = new Date(2026, 5, 10, 7, 0, 0);
      const evening = new Date(2026, 5, 10, 22, 0, 0);
      expect(dailySolution(morning, words)).toBe(dailySolution(evening, words));
    });
  });

  describe('msUntilNextLocalMidnight', () => {
    it('returns 24h at exactly midnight', () => {
      const midnight = new Date(2026, 5, 10);
      expect(msUntilNextLocalMidnight(midnight)).toBe(86_400_000);
    });

    it('returns positive value at any point in the day', () => {
      const d = new Date(2026, 5, 10, 23, 30, 0);
      const ms = msUntilNextLocalMidnight(d);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(86_400_000);
    });
  });
});

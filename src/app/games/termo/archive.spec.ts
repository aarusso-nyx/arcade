import { LAUNCH_DATE } from './daily';
import {
  dateForPuzzleNumber,
  puzzleNumberForDate,
  recentArchiveEntries,
} from './archive';

describe('archive', () => {
  describe('puzzleNumberForDate / dateForPuzzleNumber', () => {
    it('puzzle #1 corresponds to LAUNCH_DATE', () => {
      expect(puzzleNumberForDate(LAUNCH_DATE)).toBe(1);
      const d = dateForPuzzleNumber(1);
      expect(d.getFullYear()).toBe(LAUNCH_DATE.getFullYear());
      expect(d.getMonth()).toBe(LAUNCH_DATE.getMonth());
      expect(d.getDate()).toBe(LAUNCH_DATE.getDate());
    });

    it('round-trips for a range of puzzle numbers', () => {
      for (const n of [1, 2, 10, 50, 100, 365, 1000]) {
        const d = dateForPuzzleNumber(n);
        expect(puzzleNumberForDate(d)).toBe(n);
      }
    });

    it('round-trips across daylight-savings-prone dates', () => {
      // Mid-March and early November (US DST boundaries) — we use local-midnight
      // arithmetic which is DST-stable in practice for date deltas in our window.
      const candidates = [
        new Date(2026, 2, 8), // 2026-03-08 (US "spring forward")
        new Date(2026, 2, 9),
        new Date(2026, 10, 1),
        new Date(2026, 10, 2),
      ];
      for (const d of candidates) {
        const n = puzzleNumberForDate(d);
        const back = dateForPuzzleNumber(n);
        // Compare on calendar-date components, not raw ms.
        expect(back.getFullYear()).toBe(d.getFullYear());
        expect(back.getMonth()).toBe(d.getMonth());
        expect(back.getDate()).toBe(d.getDate());
      }
    });

    it('clamps to LAUNCH_DATE for n <= 1', () => {
      const d0 = dateForPuzzleNumber(0);
      const dNeg = dateForPuzzleNumber(-5);
      expect(d0.getTime()).toBe(dateForPuzzleNumber(1).getTime());
      expect(dNeg.getTime()).toBe(dateForPuzzleNumber(1).getTime());
    });
  });

  describe('recentArchiveEntries', () => {
    it('returns entries newest first', () => {
      const now = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 10,
      );
      const entries = recentArchiveEntries(5, now);
      expect(entries.length).toBe(5);
      // Today is puzzle #11; newest first → 11, 10, 9, 8, 7.
      expect(entries.map((e) => e.puzzleNumber)).toEqual([11, 10, 9, 8, 7]);
    });

    it('includes today as the first entry', () => {
      const now = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 3,
      );
      const entries = recentArchiveEntries(3, now);
      expect(entries[0].puzzleNumber).toBe(4);
    });

    it('never returns puzzles before #1', () => {
      // Just 2 days after launch, asking for 30 should give only 3 entries.
      const now = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 2,
      );
      const entries = recentArchiveEntries(30, now);
      expect(entries.length).toBe(3);
      expect(entries[entries.length - 1].puzzleNumber).toBe(1);
    });

    it('caps at today (does not return future days)', () => {
      const now = new Date(
        LAUNCH_DATE.getFullYear(),
        LAUNCH_DATE.getMonth(),
        LAUNCH_DATE.getDate() + 5,
      );
      const entries = recentArchiveEntries(10, now);
      // First entry must be today (#6); none should be > 6.
      for (const e of entries) {
        expect(e.puzzleNumber).toBeLessThanOrEqual(6);
      }
      expect(entries[0].puzzleNumber).toBe(6);
    });

    it('returns empty when count is 0', () => {
      expect(recentArchiveEntries(0)).toEqual([]);
    });
  });
});

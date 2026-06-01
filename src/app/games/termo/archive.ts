/**
 * Daily archive helpers.
 *
 * The daily puzzle number is a pure function of the local-calendar date
 * relative to LAUNCH_DATE (see daily.ts). These helpers add the reverse
 * lookup (number → date) and a paginated "recent archive" listing for the
 * archive picker UI.
 */

import { LAUNCH_DATE, MS_PER_DAY, dailyPuzzleNumber } from './daily';

function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 1-indexed puzzle number for the given local-calendar date. */
export function puzzleNumberForDate(d: Date): number {
  return dailyPuzzleNumber(d);
}

/**
 * Local-midnight Date for the given puzzle number. Clamps to LAUNCH_DATE
 * for n <= 1 so callers always get a sensible date.
 */
export function dateForPuzzleNumber(n: number): Date {
  const launch = localMidnight(LAUNCH_DATE);
  if (n <= 1) return launch;
  return new Date(launch.getTime() + (n - 1) * MS_PER_DAY);
}

export interface ArchiveEntry {
  puzzleNumber: number;
  date: Date;
}

/**
 * Last `count` archived days, newest first, capped at today (i.e.,
 * including today). Never returns future dates. If `count` exceeds the
 * available history (puzzles since launch), the list is naturally
 * truncated — we never return puzzles with number < 1.
 */
export function recentArchiveEntries(
  count: number,
  now: Date = new Date(),
): ArchiveEntry[] {
  const today = puzzleNumberForDate(now);
  const out: ArchiveEntry[] = [];
  for (let i = 0; i < count; i++) {
    const n = today - i;
    if (n < 1) break;
    out.push({ puzzleNumber: n, date: dateForPuzzleNumber(n) });
  }
  return out;
}
